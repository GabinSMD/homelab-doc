# Paperclip

Orchestration d'agents IA : serveur Node.js et interface React qui pilotent une equipe
d'agents (Claude Code, Codex, Bash, HTTP) avec des objectifs, des budgets et un suivi de
couts. Pose le 2026-09-29.

## Acces

| | |
|---|---|
| URL | `http://100.97.239.90:3100` — **adresse Tailscale uniquement** |
| Host | penny (Docker, reseau dedie `paperclip`) |
| Image | `ghcr.io/paperclipai/paperclip:latest@sha256:a02ac35a…` (index multi-arch) |
| Base | `postgres:17-alpine`, conteneur `paperclip-db`, aucun port publie |
| Auth | compte local Paperclip (`PAPERCLIP_DEPLOYMENT_MODE: authenticated`) |
| Secrets | `PAPERCLIP_AUTH_SECRET`, `PAPERCLIP_DB_PASSWORD` dans `.env.enc` (sops) |

Ni Traefik ni Authelia, donc **pas de sous-domaine**. C'est deliberé : cette console
pilote des agents qui executent du code et depensent de l'argent, on ne lui donne pas
d'entree publique derriere une seule couche d'authentification.

Verifie a la pose : `HTTP 200` depuis le tailnet, `HTTP 000` depuis `192.168.1.28` — le
LAN n'y accede pas.

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

## Ce qu'il reste a faire

- **Aucune cle LLM n'est configuree.** En l'etat l'interface fonctionne mais aucun agent ne
  peut travailler : `api.anthropic.com` repond `401`. La cle se pose depuis l'interface.
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
