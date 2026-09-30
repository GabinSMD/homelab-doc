# Paperclip

Orchestration d'agents IA : serveur Node.js et interface React qui pilotent une equipe
d'agents (Claude Code, Codex, Bash, HTTP) avec des objectifs, des budgets et un suivi de
couts. Pose le 2026-09-29.

## Acces

| | |
|---|---|
| URL | `https://paperclip.home.gabin-simond.fr` |
| Host | penny (Docker, reseau dedie `paperclip`) |
| Image | `ghcr.io/paperclipai/paperclip:latest@sha256:a02ac35a…` (index multi-arch) |
| Base | `postgres:17-alpine`, conteneur `paperclip-db`, aucun port publie |
| Auth | Authelia (forwardAuth) **puis** compte local Paperclip |
| Secrets | `PAPERCLIP_AUTH_SECRET`, `PAPERCLIP_DB_PASSWORD` dans `.env.enc` (sops) |

Joignable depuis le LAN sans Tailscale, comme les autres services. Le nom resolvait deja
vers `192.168.1.28` sans qu'aucune entree DNS soit a creer, et un resolveur public ne rend
rien : la resolution reste interne.

**Une seule porte.** Le service a d'abord ete pose avec un port brut sur l'adresse
Tailscale de penny ; il a ete retire lors du passage sous Traefik, pour ne pas laisser
ouverte une entree qui contourne Authelia.

Double ouverture de session — Authelia, puis le compte Paperclip — assumee pour une
console qui pilote des agents executant du code et depensant de l'argent.

:::danger Les agents n'appellent PAS l'API en local par defaut
Affirme a tort ici le 2026-09-30 : « le forwardAuth ne casse aucun battement de cœur,
les agents joignent le serveur en local ». C'etait une supposition. Les agents appellent
`PAPERCLIP_API_URL`, que le demarrage **derive de `PAPERCLIP_PUBLIC_URL`** quand elle
n'est pas fixee — donc leurs requetes ressortaient vers Traefik, donc vers Authelia :
`302` sur tout `/api`, et les deux serveurs MCP tombes en `401`.

Le compose fixe desormais `PAPERCLIP_API_URL: "http://127.0.0.1:3100"`. Les appels
d'agents ne sortent plus du conteneur et la surface publique garde Authelia entiere —
plutot que de percer le proxy pour `/api`, ce qui aurait ouvert l'API au LAN.

**Comment distinguer les deux pannes** : un `401` vient de Paperclip, qui a recu la
requete et refuse faute de jeton. Un `302` vers `auth.home.gabin-simond.fr` vient du
proxy, qui a intercepte avant. Le second signale un probleme de routage, jamais
d'authentification applicative.
:::

Verifie a la bascule : routeur `paperclip@docker` actif avec ses trois intergiciels, et
backend sonde **depuis Traefik** a `HTTP 200`. Un 302 d'Authelia ne dit rien du backend,
il vient du middleware.

:::note Un 403 en sondant par IP est normal
Paperclip verifie l'en-tete `Host` contre son `PAPERCLIP_PUBLIC_URL`. Une sonde par
adresse IP rend donc `403 Forbidden` — c'est son controle d'origine, pas une panne. Avec
`--header="Host: paperclip.home.gabin-simond.fr"` il rend `200`.
:::

## Pourquoi sur penny et pas dans un LXC

Un LXC dedie sur un nœud Proxmox etait le premier choix, pour isoler l'outil des secrets :
penny porte la cle age sops et le `.env` de toute la stack. Le LXC 112 a bien ete cree sur
galahad, avec Docker et Tailscale, puis **detruit**. La mesure a tranche :

- les deux nœuds tournent sur une **eMMC unique de 57,7 Go**, sans disque libre ;
- galahad avait 11 Go de marge, lancelot 6,3 Go ;
- la seule image Paperclip pese **4,63 Go decompressee**, ~7 Go avec Postgres et le
  systeme, avant la moindre donnee.

La premiere extraction a rempli galahad a 91 %. `pct fstrim 112` a rendu 6,1 Go et le nœud
est revenu a 75 % — sans ce TRIM, l'espace libere dans un conteneur ne remonte jamais a
l'hote.

L'isolation est donc au niveau du conteneur. Ce qui la rend acceptable :

- **aucun montage de l'hote**, donc ni la cle age ni le `.env` ne sont visibles ;
- **aucun acces a la socket Docker**, meme pas via `socket-proxy` ;
- **reseau dedie** : Paperclip et sa base ne joignent aucun autre service de la stack.

Le risque qui demeure — les agents peuvent joindre le LAN — etait **identique** dans un
LXC. Le choix ne l'a donc pas aggrave.

## Ecarts par rapport au compose amont

Le depot amont fournit `docker/docker-compose.yml`. Trois ecarts assumes :

| Amont | Ici | Pourquoi |
|---|---|---|
| base publiee sur `5432` de l'hote | aucun port | n'a de sens qu'en developpement |
| mot de passe `paperclip` | engendre, scelle sops | — |
| construction depuis les sources | image publiee, epinglee | le monorepo pnpm fait 293 Mo |

L'epinglage porte sur l'empreinte de l'**index** multi-architecture, verifie comme tel
avant d'etre fige (`application/vnd.oci.image.index.v1+json`) : il resout arm64 sur penny
et amd64 ailleurs. Un digest de manifeste de plateforme aurait casse toute reutilisation.

## Connecter un agent Claude a son abonnement

L'interface propose une commande du genre :

```bash
(export CLAUDE_CONFIG_DIR='/paperclip/instances/default/ai-local-logins/<UUID>' \
  && mkdir -p "$CLAUDE_CONFIG_DIR" && claude auth login)
```

Lancee telle quelle sur son poste, elle echoue avec **« Could not verify the local
subscription »**. Deux raisons, mesurees le 2026-09-30 :

1. **`/paperclip` est un chemin INTERNE au conteneur.** Sur un poste, la commande cree un
   repertoire local que le serveur ne lira jamais. La CLI `claude` est d'ailleurs deja
   presente dans l'image, en `/usr/local/bin/claude`.
2. **Le serveur tourne en `uid 1000` (`node`), pas en root.** Une connexion faite en root
   depose des fichiers que le serveur ne peut pas lire. `docker exec` sans `-u node`
   attaque donc le probleme du mauvais cote.

Un troisieme piege : **l'UUID change a chaque tentative de connexion**. Il faut celui que
l'ecran affiche a cet instant, pas celui d'un essai precedent.

La forme qui marche, depuis penny — **une seule ligne, rien a remplacer** : elle retient
le repertoire de connexion le plus recent, donc celui de l'ecran en cours.

```bash
docker exec -it -u node paperclip bash -lc 'd=$(ls -1dt /paperclip/instances/default/ai-local-logins/*/ | head -1); echo "-> $d"; CLAUDE_CONFIG_DIR="${d%/}" claude auth login'
```

Cliquer « Connect » dans Paperclip **avant** de la lancer, pour que le repertoire vise
soit bien celui de la tentative en cours.

:::caution Ne pas recopier un emplacement entre chevrons
Une commande contenant `<UUID>` collee telle quelle echoue sur
`syntax error near unexpected token` : bash lit `<` comme une redirection. D'ou la forme
ci-dessus, qui n'a aucun emplacement a remplacer.
:::

Le `-it` est indispensable : la CLI affiche un lien puis **attend un code colle**. On
ouvre le lien dans son navigateur, on autorise, on recolle le code. Ensuite, « Connect »
dans l'interface Paperclip.

Pour verifier sans deviner, meme principe :

```bash
docker exec -u node paperclip bash -lc 'd=$(ls -1dt /paperclip/instances/default/ai-local-logins/*/ | head -1); CLAUDE_CONFIG_DIR="${d%/}" claude auth status'
```

`"loggedIn": false` avec `"authMethod": "none"` est exactement ce que Paperclip lit avant
de refuser. Le repertoire existe mais reste **vide** tant que la connexion n'a pas abouti.

## Ce qu'il reste a faire

- **Aucun agent n'est connecte** tant que la procedure ci-dessus n'a pas ete menee a bien.
- **Surveiller la depense.** Le homelab a deja retire un outil d'agents pour cause de bruit
  et de cout. Definir un budget dans Paperclip avant de lancer quoi que ce soit.
- Pas encore de tuile Homepage ni de sonde de disponibilite.

## Exploitation

```bash
cd /mnt/ssd/config/docker
docker compose up -d paperclip-db paperclip   # demarrer
docker compose logs -f paperclip              # journaux
docker compose restart paperclip              # redemarrer
```

Les volumes `paperclip-data` et `paperclip-db` portent l'etat. Les plafonds sont poses :
`mem_limit` 2 Go pour le serveur et 512 Mo pour la base, `pids_limit` 2048 — penny n'a que
7 Go de RAM.
