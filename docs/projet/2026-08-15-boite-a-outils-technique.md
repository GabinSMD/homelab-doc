# Boîte à outils technique — design

**Date** : 2026-08-15
**Statut** : validé, prêt pour implémentation
**Portée** : `homelab-config/docker/docker-compose.yml`, `homelab-config/traefik/`, `homelab-config/scripts/homelab_backup.sh`, `homelab-config/homepage/`

## Contexte

Le homelab rend aujourd'hui des services d'infrastructure : DNS, reverse proxy, SSO,
secrets, sauvegardes, observabilité. Il ne rend aucun service *d'usage* — rien qui
serve à travailler au quotidien.

La demande porte explicitement sur du technique et de l'utile : du développement, de
la domotique, de l'édition de documents. Le média (bibliothèques de films, lecture,
musique) est hors sujet et le restera.

Ce document couvre le premier lot : sept services orientés développement et
documentation. La domotique fait l'objet d'une décision séparée, parce qu'elle
suppose du matériel et non seulement des conteneurs.

## Contraintes mesurées

Les chiffres ci-dessous ont été relevés le 2026-08-15, pas estimés.

| ressource | état | conséquence |
|---|---|---|
| RAM penny | 1,8 Go utilisés sur 7,7 ; 2,2 Go de plafonds déclarés | large marge |
| Disque images Docker | `data-root` sur `/mnt/ssd`, 440 Go libres | non contraignant |
| Débit du SSD | **32,3 Mo/s** mesurés, lien USB 2.0 | contraignant pour les I/O |
| VG des nœuds PVE | **5,12 Go libres** sur chacun, eMMC 57,7 Go, aucun disque de rechange | ressource rare |
| DNS | joker `*.home.gabin-simond.fr → 192.168.1.28` déjà en place | ajout gratuit |
| Authelia | `default_policy: two_factor` | tout nouveau service protégé d'office |
| socket-proxy | `CONTAINERS: 1` | couvre déjà la lecture des logs Docker |

Deux conclusions structurent tout le reste. D'abord, **la ressource rare n'est pas la
RAM mais le disque des nœuds** : 5,12 Go de VG libre chacun, sans possibilité
d'extension. Ensuite, **le SSD de penny est lent** : tout service gourmand en
entrées/sorties entre en concurrence avec les sauvegardes de 3 h et avec le datastore
PBS, qui vit sur ce même disque et est exporté en NFS.

## Décision

Sept services, tous en conteneurs sur penny.

| service | rôle | sous-domaine | plafond RAM | état |
|---|---|---|---|---|
| ~~IT Tools~~ | ~~~70 utilitaires dev (JWT, base64, hash, cron, regex)~~ | ~~`ittools.`~~ | — | **abandonné le 2026-08-23, voir ci-dessous** |
| CyberChef | transformations de données, encodages, crypto | `cyberchef.` | 64 Mo | aucun |
| Kroki + sidecar mermaid | rendu de diagrammes depuis du texte | `kroki.` | 512 + 256 Mo | aucun |
| Dozzle | logs Docker en direct | `dozzle.` | 128 Mo | aucun |
| Stirling-PDF (variante allégée) | fusion, découpe, compression de PDF | `pdf.` | 768 Mo | temporaire |
| Forgejo | forge git + suivi de tickets | `git.` | 512 Mo | **dépôts + SQLite** |
| Outline (+ PostgreSQL + Redis) | wiki privé | `wiki.` | 512 + 256 + 64 Mo | **base + pièces jointes** |

!!! warning "IT Tools abandonné le 2026-08-23 — six services au lieu de sept"
    Les six autres ont été déployés dans la foulée du 15/08. IT Tools, non — et
    l'écart est resté invisible huit jours : le joker DNS
    `*.home.gabin-simond.fr` résout `ittools.` vers Traefik, qui répondait 404.
    Un sous-domaine qui répond une erreur ressemble à un service en panne, pas à
    un service inexistant.

    **Raison de l'abandon** : le recouvrement avec CyberChef, déjà en place —
    base64, hachages, JWT, regex, conversions relèvent du même usage. IT Tools
    n'apportait en propre que des générateurs (UUID, mots de passe, analyse de
    cron) et une interface plus directe.

    L'argument « coût quasi nul » de cette page reste vrai en ressources
    (64 Mo, sans état) mais il ignore un coût réel : chaque service ajoute une
    ligne au scan Trivy, un certificat à renouveler, une entrée Homepage et une
    surface exposée derrière Authelia. À usage recouvert, ce coût n'est pas
    justifié.

    Décision réversible : cinq lignes de compose, le DNS et Authelia sont déjà
    prêts.

### Pourquoi penny et pas les nœuds

Les 5,12 Go de VG libres sur galahad et lancelot sont la seule ressource du parc qui
ne peut pas être reconstituée sans acheter du matériel. Aucun de ces sept services ne
justifie de la consommer : ils tiennent tous dans les 440 Go du SSD de penny, sur une
machine qui a déjà Traefik, Authelia, CrowdSec et la chaîne de sauvegarde.

### Pourquoi Kroki plutôt qu'un simple outil de diagrammes

Kroki est le seul du lot qui améliore un flux existant plutôt que d'en ajouter un.
Les schémas d'architecture de `homelab-doc` deviennent du texte versionné rendu à la
volée, au lieu d'images à refaire à la main à chaque évolution.

### Pourquoi Outline plutôt qu'AFFiNE

Le critère décisif est la **nature du verrouillage**, pas la licence. Outline stocke
du Markdown : un export suffit à repartir entier si le projet ou sa licence BSL
devenaient gênants. AFFiNE est en AGPL-3.0, donc plus libre sur le papier, mais ses
documents en blocs CRDT retiennent les données plus sûrement qu'une licence.

S'y ajoute un point pratique : Outline se branche sur Authelia en OIDC générique de
façon éprouvée. L'état d'OIDC dans AFFiNE auto-hébergé n'a pas pu être confirmé, et un
service hors SSO est un compte de plus à gérer — donc un constat d'audit en attente.

Le mode « tableau blanc » d'AFFiNE est le vrai renoncement de ce choix. Si le besoin de
dessiner apparaît, Excalidraw en autonome le couvre pour un coût quasi nul.

L'architecture n'a pas départagé : **les deux publient des images arm64**, vérifié le
2026-08-15. Ce critère, qui aurait tranché seul, ne s'applique pas.

## Patron commun

Identique pour les sept, calqué sur le service `homepage` existant :

- réseau `proxy`, **aucun port publié** — l'accès passe uniquement par Traefik ;
- exposition par labels Traefik, obligatoire puisque `exposedByDefault: false` ;
- chaîne de middlewares `crowdsec` + `security-headers` + `rate-limit` ;
- image **épinglée par digest**, pour que Renovate la suive ;
- `mem_limit`, `cap_drop: ALL`, `security_opt: no-new-privileges` ;
- `read_only: true` + `tmpfs` partout où l'application le supporte.

Authelia ne demande aucune modification : `default_policy: two_factor` protège tout
nouvel hôte d'office. Le DNS non plus, grâce au joker déjà en place.

### Dozzle et l'accès Docker

Dozzle a besoin de l'API Docker. Il passe par le `socket-proxy` existant
(`DOCKER_HOST=tcp://socket-proxy:2375`) et **n'exige aucune permission nouvelle** :
`CONTAINERS: 1` couvre déjà `/containers/{id}/logs`. Le socket Docker n'est jamais
monté dans Dozzle.

## Les deux services avec état

### Forgejo

SQLite plutôt que PostgreSQL : les dépôts visés sont de la configuration et de la
documentation, pas un monorepo. Cela évite une base de plus à exploiter et à
sauvegarder.

**HTTPS seulement, pas de SSH git.** Cela évite d'exposer un port supplémentaire, et
l'accès au homelab est déjà restreint à Tailscale.

**Miroir push vers GitHub, par dépôt.** Héberger chez soi le git qui contient la
configuration de l'infrastructure crée une dépendance circulaire : le 2026-08-14, une
coupure de courant aurait rendu les runbooks illisibles au moment précis où ils
servaient. GitHub reste la copie lisible quand le homelab est à terre.

**Les runners CI sont hors périmètre.** Ils appellent des décisions propres —
privilèges d'exécution, place disque, isolation — et doublent la surface de risque.

### Outline

Trois conteneurs : Outline, PostgreSQL, Redis. Stockage des pièces jointes en local
sur le SSD, pas en S3.

C'est le service le plus lourd du lot et le seul dont le besoin ne soit pas
démontrable a priori : il répond à une friction d'écriture, pas à un manque
identifié. **C'est donc le premier à retirer** si le lot doit être allégé.

### Sauvegardes

Forgejo et Outline sont les deux seuls services à rattacher à `homelab_backup.sh`.
Les cinq autres n'ont pas d'état : leur configuration vit dans git, leur perte est un
`docker compose up` à réémettre.

Le rattachement est explicite et vérifié par une restitution de contrôle, pas
supposé. L'expérience du 2026-08-03 — deux dépôts en panne silencieuse pendant des
jours — impose de vérifier qu'une donnée est réellement dans l'instantané.

## Point transverse : le certificat joker

Traefik émet aujourd'hui **un certificat par sous-domaine** ; on en compte 22 dans
`acme.json`. Sept services de plus produiraient sept nouvelles entrées en journal de
transparence des certificats. Or `ct-log-monitor.sh` compare les noms observés à une
liste connue par différence littérale (`comm -23`), et cette liste ne contient que
deux lignes.

**Sept notifications partiraient**, toutes exactes et toutes inutiles.

La correction retenue est un **certificat joker `*.home.gabin-simond.fr`**, émis par
le défi DNS-01 Cloudflare déjà configuré. Un seul certificat, plus aucun bruit CT à
chaque nouveau service, et moins de sollicitations de Let's Encrypt.

L'alternative — pré-alimenter la liste des domaines connus — fonctionne aussi mais ne
règle le problème qu'une fois : le suivant reproduirait le bruit.

Le risque de cette bascule est réel et doit être traité comme tel : une erreur de
configuration TLS affecte **tous** les services d'un coup. Les certificats unitaires
existants restent dans `acme.json` et servent de filet ; la vérification porte sur les
services déjà en place, pas seulement sur les nouveaux.

## Ce qui est volontairement exclu

- **Tout média** : films, séries, musique, lecture. Hors sujet.
- **Les runners CI de Forgejo** : décision séparée.
- **La domotique** : suppose du matériel, fera l'objet de son propre document. Le
  besoin est identifié — une prise à mesure de consommation aurait daté la coupure du
  2026-08-14, que rien n'a su nommer.
- **Excalidraw** : couvert par Kroki pour les schémas versionnés ; à rouvrir si le
  besoin de dessin libre apparaît.

## Coût

Environ 3,1 Go de plafonds RAM ajoutés, portant le total déclaré à ~5,3 Go sur 7,7.
Ce sont des **plafonds, pas des réservations** : l'usage réel attendu est de l'ordre
de 1,3 Go, ce qui place penny autour de 3,1 Go sur 7,7. Les plafonds existent pour
qu'un emballement tue le conteneur fautif plutôt que la machine.

Quelques gigaoctets d'images sur 440 Go libres. Deux lignes de sauvegarde
supplémentaires.

Le profil mémoire est déséquilibré : Kroki et Stirling-PDF sont deux applications
Java et pèsent à elles deux 1,5 Go des 3,1. Les cinq autres réunis coûtent moins
qu'une seule des deux.

## Vérifications attendues

L'implémentation n'est terminée que si chacun de ces points est constaté, pas supposé :

1. Les sept hôtes répondent à travers Traefik en HTTPS.
2. Un accès non authentifié est bien redirigé vers Authelia.
3. Les services **préexistants** répondent toujours après la bascule du certificat
   joker — c'est la vérification la plus importante du lot.
4. Aucune notification ntfy n'est émise pendant le déploiement.
5. Les données de Forgejo et d'Outline sont retrouvées dans un instantané restic.
6. La consommation mémoire réelle est mesurée et comparée à l'estimation ci-dessus.
