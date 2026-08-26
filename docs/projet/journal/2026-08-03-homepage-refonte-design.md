# Refonte du dashboard Homepage — design

**Date** : 2026-08-03
**Statut** : validé, prêt pour plan d'implémentation
**Portée** : `homelab-config/homepage/` (contenu + CSS) et un ajout au `docker-compose.yml`

## Contexte

Le dashboard `home.gabin-simond.fr` (Homepage, conteneur sur penny) sert deux usages
simultanés : page d'accueil de navigateur sur desktop et tablette murale tactile
lue à environ un mètre.

Deux problèmes le rendent moins utile qu'il devrait l'être.

**Hiérarchie plate.** Chaque carte est à la fois un lien et un widget de métriques.
Un CPU Proxmox à 4 % occupe exactement la même place visuelle qu'un backup périmé
depuis six jours. Résultat : beaucoup de chiffres, aucun signal. La demande n'est
pas « moins de métriques » — c'est de pouvoir suivre les métriques principales sans
ouvrir Grafana ou Pulse à chaque fois.

**Dette CSS.** `custom.css` fait 1409 lignes et fonctionne *contre* Homepage :
environ 200 lignes ne servent qu'à neutraliser les pseudo-éléments et les fonds
générés par les classes Tailwind de l'application, à coups de `!important`. Chaque
mise à jour de Homepage est un risque de régression visuelle.

**Contenu périmé.** L'agent SRE a été renommé `fish` → `sucre` le 2026-07-06 ; la
carte pointe encore sur `fish.tail8850a4.ts.net`. Trois services en production ne
figurent pas au dashboard : ntfy, DNS failover, serveur Project Zomboid.

## Objectifs

1. Un coup d'œil suffit pour répondre à « est-ce que quelque chose va mal ? »
2. Les métriques principales restent consultables sans ouvrir un autre outil
3. Le CSS devient maintenable et survit aux mises à jour de Homepage
4. Le contenu reflète l'infrastructure réelle
5. Le rendu reste fluide sur une tablette allumée en continu

## Non-objectifs

- Remplacer Grafana, Pulse ou Beszel : le dashboard oriente vers eux, il ne les duplique pas
- Ajouter de l'alerting : les notifications restent sur ntfy, le dashboard est passif
- Exposer quoi que ce soit hors du LAN et de Tailscale

## A. Architecture de l'information

Les groupes actuels sont nommés par technologie (« Virtualisation », « Monitoring »).
Ils sont renommés par usage, et un bandeau de signaux passe en premier.

### Groupe 1 — État (bandeau, `style: row`, `columns: 4`)

Quatre cartes agrégées. Ce sont les seuls points d'entrée vers leurs outils
respectifs : Grafana n'apparaît que comme « Alertes », Beszel que comme « Machines ».
Aucune métrique n'est affichée deux fois sur la page.

| Carte | Widget | Signal | Lien |
|---|---|---|---|
| Sauvegardes | `customapi` → `http://status/homelab.json` | âge du snapshot le plus vieux, nombre de repos périmés | PBS |
| Alertes | `customapi` → API Grafana (cf. section D) | nombre d'alertes en état `firing` | `logs.home.gabin-simond.fr` |
| Machines | `beszel` (`beszel:8090`, `version: 2`) | hôtes joignables sur total | `monitor.home.gabin-simond.fr` |
| Sécurité | `crowdsec` (`crowdsec:8080`, `limit24h: true`) | bans sur 24 h | — |

### Groupe 2 — Infrastructure (`columns: 4`)

| Carte | `siteMonitor` | Widget |
|---|---|---|
| galahad | `https://192.168.1.18:8006` | `proxmox`, `node: galahad` |
| lancelot | `https://192.168.1.19:8006` | `proxmox`, `node: lancelot` |
| PBS | `https://192.168.1.33:8007` | `proxmoxbackupserver` |
| Portainer | `https://portainer:9443` | `portainer`, `env: 3` |

### Groupe 3 — Réseau & accès (`columns: 3`)

| Carte | `siteMonitor` | Widget |
|---|---|---|
| Traefik | `http://traefik:8080/ping` | `traefik` |
| AdGuard | `http://192.168.1.28:3000` | `adguard` |
| DNS failover | `http://192.168.1.30:3000` | `adguard` (LXC 100, galahad) |
| Authelia | `http://authelia:9091/api/health` | — |
| Switch LAN | `http://192.168.1.2` | — (gagne un `href`, aujourd'hui absent) |

### Groupe 4 — Applications (`columns: 3`)

| Carte | `siteMonitor` | Widget |
|---|---|---|
| Vaultwarden | `http://192.168.1.32:8080` | — |
| ntfy | `http://ntfy:8080/v1/health` | — |
| Pulse | `http://192.168.1.34:7655` | — |
| sucre | `http://192.168.1.183:8080/health` | `customapi` (incidents 24 h, en attente, exec 24 h, budget %) |
| Project Zomboid | aucun | — |

Project Zomboid n'a pas de `siteMonitor` : le serveur écoute en UDP sur le port de
jeu et n'expose aucun endpoint HTTP. Homepage ne sait sonder que du HTTP. Afficher
un point de statut ici mentirait ; la carte reste un lien avec sa description
(LXC 104, galahad).

### Groupe 5 — Liens (`bookmarks.yaml`)

Documentation publique, `homelab-config`, `homelab-doc`, topic ntfy.

### Nettoyage

- `fish` → `sucre` : nom, `href`, IP, description
- suppression de `proxmox.yaml` et `kubernetes.yaml` (fichiers de stubs commentés, non utilisés)
- suppression des clés `openweathermap` / `weatherapi` de `settings.yaml` : ce sont
  des placeholders (`openweathermapapikey`), et le widget météo actif est `openmeteo`,
  qui ne demande aucune clé
- `layout:` de `settings.yaml` réécrit pour les cinq nouveaux groupes

Le bloc `calendar` commenté de `widgets.yaml` est conservé en l'état : c'est une
option documentée non activée, pas du code mort.

## B. Design visuel

Réécriture de `custom.css` depuis zéro, environ 400 lignes au lieu de 1409.
L'identité visuelle est conservée — sombre, verre, accent indigo — mais le CSS
travaille désormais *avec* le thème Homepage (`theme: dark`, `color: slate`) :
surcharge d'une quinzaine de variables et d'une dizaine de sélecteurs, au lieu
d'annuler les classes générées par l'application.

Six décisions.

**1. Plus d'`@import` Google Fonts.** Le fichier actuel importe Inter et JetBrains
Mono depuis `fonts.googleapis.com`. C'est une requête tierce bloquante au rendu, à
chaque chargement, pour un service strictement privé. Remplacement par une pile de
polices système, avec `tabular-nums` pour les chiffres.

**2. Le flou est réservé aux grandes surfaces.** Aujourd'hui chaque carte porte
`backdrop-filter: blur(40px) saturate(180%)` — plus de vingt surfaces floutées
composées à chaque frame. Le flou ne reste que sur le rail supérieur et le bandeau
État ; les cartes passent en fond translucide plat. Le rendu se fait sur le client,
donc c'est le scroll de la tablette murale qui en bénéficie.

**3. Fond en gradient statique.** L'animation `aurora-drift` en boucle infinie
provoque un repaint permanent sur un écran allumé 24/7, pour un mouvement que
personne ne regarde. Le maillage de gradients est conservé, figé.

**4. Couleur sémantique stricte.** L'indigo ne signale que l'interactif (survol,
focus, appui). Vert, ambre et rouge sont réservés à un état réel. Une carte qui va
bien est neutre : la couleur devient un signal parce qu'elle est rare.

**5. Trois tailles de typographie** au lieu d'une échelle ad hoc, dimensionnées
pour rester lisibles à un mètre.

**6. Un seul bloc `@media (hover: none) and (pointer: coarse)`** rassemble tout le
comportement tactile (cibles ≥ 48 px, pas d'effet réservé au survol), au lieu de
règles tactiles dispersées dans le fichier.

`prefers-reduced-motion` continue d'être respecté.

## C. Fraîcheur des sauvegardes — `status.json`

Des quatre signaux du bandeau, trois existent en widget natif. Le quatrième —
l'âge du dernier backup réussi — n'existe dans aucun widget Homepage, et c'est
précisément l'angle mort qui a laissé Vaultwarden sans sauvegarde pendant six jours
en juillet 2026 (verrou restic périmé, signalé seulement dans un log local).

Il est déjà calculé par `scripts/backup-freshness-check.sh`. Trois pièces :

**1. Le script écrit un JSON en plus de son comportement actuel.** Le chemin est
`/mnt/ssd/status/homelab.json`, écrit de façon atomique (fichier temporaire puis
`mv`) pour qu'un lecteur ne voie jamais un JSON tronqué. Contrat :

```json
{
  "generated_at": "2026-08-03T04:30:12+02:00",
  "max_age_hours": 11,
  "stale_count": 0,
  "repos_total": 4,
  "stale_repos": []
}
```

Le comportement existant du script — notification ntfy au-delà du seuil, cooldown,
log — n'est pas modifié. L'écriture du JSON est inconditionnelle, y compris quand
tout va bien : c'est ce qui permet de distinguer « tout va bien » de « le contrôle
ne tourne plus ».

**2. Un micro-conteneur sert le fichier.** `busybox httpd` en `read_only`, avec
`cap_drop: ALL` et `no-new-privileges`, monte `/mnt/ssd/status` en lecture seule,
sur le réseau interne uniquement. Aucun label Traefik, aucune publication de port :
seul Homepage l'atteint, par nom de conteneur.

**3. Homepage le lit** en `customapi` sur `http://status/homelab.json`, avec des
`mappings` sur `max_age_hours` et `stale_count`.

Si le JSON devient périmé ou illisible, le widget affiche `?`. C'est le
comportement voulu : un contrôle de fraîcheur qui ne tourne plus doit se voir.

## D. Contrainte Grafana — vérifiée

Le widget natif `grafana` de Homepage s'authentifie en HTTP basic. Le Grafana du
homelab (LXC 101, lancelot) tourne avec `GF_AUTH_BASIC_ENABLED: "false"` et
`GF_AUTH_DISABLE_LOGIN_FORM: "true"` — OIDC Authelia uniquement. **Le widget natif
ne peut donc pas fonctionner.**

La carte « Alertes » utilise à la place un `customapi` sur
`http://192.168.1.31:3000/api/prometheus/grafana/api/v1/rules`, authentifié par un
**service account token** Grafana en `Authorization: Bearer`. Les tokens de service
account restent valides quand l'auth basique est désactivée : c'est le chemin
prévu par Grafana pour l'accès machine.

Le token est créé avec le rôle `Viewer` (lecture seule suffit), stocké dans
`.env.enc` (sops) sous `HOMEPAGE_VAR_GRAFANA_TOKEN`, et injecté au conteneur comme
les autres secrets Homepage.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `homelab-config/homepage/services.yaml` | réécriture (4 groupes de services, 18 cartes) |
| `homelab-config/homepage/settings.yaml` | `layout:` réécrit, clés météo mortes retirées |
| `homelab-config/homepage/custom.css` | réécriture complète |
| `homelab-config/homepage/bookmarks.yaml` | ajout du topic ntfy |
| `homelab-config/homepage/proxmox.yaml` | suppression |
| `homelab-config/homepage/kubernetes.yaml` | suppression |
| `homelab-config/scripts/backup-freshness-check.sh` | ajout de l'écriture atomique du JSON |
| `homelab-config/docker/docker-compose.yml` | service `status` + `HOMEPAGE_VAR_GRAFANA_TOKEN` |
| `homelab-config/.env.enc` | ajout du token Grafana |

## Validation

1. `docker compose config` avant tout `up`. Attention au piège connu : une
   variable en `${VAR:?}` casse la CI, qui n'a pas de `.env` — si le nouveau
   secret est écrit sous cette forme, il faut le stubber dans le bloc `env` de
   l'étape *Validate*.
2. `curl` sur chaque `siteMonitor` du spec, et confirmation d'un point vert par
   carte avant commit. Les endpoints du tableau ci-dessus ont été sondés le
   2026-08-03 ; ils répondent.
3. Vérification que `/mnt/ssd/status/homelab.json` est bien produit par une
   exécution manuelle du script, et que `curl http://status/homelab.json` depuis
   le réseau Docker le renvoie.
4. Validation visuelle par l'utilisateur, sur desktop **et** sur la tablette. Elle
   ne peut pas être automatisée : le dashboard est derrière Authelia, et penny n'a
   ni Node ni Playwright fonctionnel — le rendu direct du conteneur ressort blanc.

## Rollback

Homepage relit `services.yaml`, `settings.yaml`, `bookmarks.yaml` et `custom.css`
à chaud : un `git revert` suffit, sans redémarrage. Le service `status` et la
variable d'environnement ajoutés au compose demandent en revanche un
`docker compose up -d` pour être retirés.

## Risques

| Risque | Traitement |
|---|---|
| Le token de service account Grafana n'a pas accès aux règles d'alerte | vérifier en `curl` avant d'écrire la carte ; si l'endpoint refuse, replier sur `/api/v1/provisioning/alert-rules` |
| Un conteneur de plus dans la stack de penny | `busybox httpd` ≈ 4 Mo, sans réseau externe et sans route Traefik ; à mettre en regard du fait qu'il porte le signal de fraîcheur des backups |
| La réécriture CSS régresse sur un écran non testé | le CSS est réécrit sur les variables de thème Homepage plutôt que contre ses classes, donc un défaut résiduel dégrade vers le thème natif au lieu de casser la mise en page |

## Hors périmètre — à traiter séparément

`GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET` est en clair dans
`/opt/logs/docker-compose.yml` sur le LXC 101, qui n'est pas sous git et donc pas
couvert par sops. C'est indépendant de cette refonte, mais constaté en la
préparant.
