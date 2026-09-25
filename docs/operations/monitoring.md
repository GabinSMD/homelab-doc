# Monitoring

## Vue d'ensemble

```mermaid
graph TD
    Script[homelab_monitor.sh<br/>cron 1min] -->|push| Ntfy[ntfy.sh<br/>Notifications]
    Beszel[Beszel Server] -->|dashboard| Web[Interface web]
    DD[digest-drift-check<br/>timer mensuel] -->|compare digests| Docker[Images Docker]
    
    Script -->|surveille| SSD[SSD]
    Script -->|surveille| Temp[Temperature]
    Script -->|surveille| Power[Alimentation]
    Script -->|surveille| Containers[Containers]
    Script -->|surveille| Disk[Espace disque]
    Script -->|surveille| RAM[RAM + OOM]

    Agent1[Beszel Agent penny] -->|:45876| Beszel
    Agent2[Beszel Agent galahad] -->|:45876| Beszel
    Agent3[Beszel Agent lancelot] -->|:45876| Beszel
```

## homelab_monitor.sh

Script bash executé **chaque minute** via cron. Surveillé :

| Check | Seuil | Alerte |
|---|---|---|
| SSD monte | `/mnt/ssd` absent | ⚠️ critique |
| SSD lisible | Erreur I/O | ⚠️ critique |
| SSD read-only | Remonte en ro | ⚠️ critique |
| USB errors dans dmesg | Disconnect/offline | ⚠️ haute |
| **SMART SSD** (horaire) | CRC errors ↑ (câble/bridge suspect) haute ; realloc/pending/uncorr ↑ (NAND) urgente ; temp > 65°C | ⚠️ variable |
| Temperature | > 70°C warning, > 80°C critique | ⚠️ variable |
| Alimentation | Throttling / under-voltage | ⚠️ haute |
| Espace disque SD/SSD | > 80% warning, > 95% critique | ⚠️ variable |
| RAM + OOM kill | > 90% ou OOM détecté | ⚠️ critique |
| Docker daemon | Ne répond plus | ⚠️ critique |
| Containers | Stopped / unhealthy | ⚠️ haute |
| **Auto-repair docker** | Stack vide + daemon UP > 2 min | ⚠️ info (wrench) |
| **House alive** | Freebox injoignable TCP 80/443 | ⚠️ urgent |
| **Internet reach** | 1.1.1.1 + 9.9.9.9 TCP 53 KO | ⚠️ haute |
| **Cluster hosts** | galahad/lancelot ping + SSH port | ⚠️ urgent |
| **Logs stack** | Grafana + Loki HTTP 200 | ⚠️ haute |
| **AdGuard sync** | Canary rewrite secondaire | ⚠️ haute |
| **Restic freshness** | 4 repos R2 (3h vault, 30h autres) | ⚠️ urgent |
| **PBS health** | LXC 103 API :8007 | ⚠️ urgent |

### Cascade suppression (depuis 2026-04-19)

Quand une alerte parente explique plusieurs enfants, le monitor **supprimé** les alertes redondantes pour éviter le spam :

| Si | Alerte(s) supprimée(s) | Justification |
|---|---|---|
| `house-down` (Freebox ou internet KO) | `cluster-hosts` (galahad/lancelot), `logs-stack`, `pbs-down` | Pas joignable car la maison est down |
| `lancelot-down` | `logs-stack`, `pbs-down` | Les 2 LXC (101, 103) vivent sur lancelot |

Le log `(suppressed: parent-flag)` montre la suppression. Tu ne recois qu'**une** notification au lieu de 4 pour le même incident cause-racine.

### Auto-repair docker

`check_docker_autorepair` — si `docker info` OK + `docker ps -q` vide depuis > 2 min + pas de flag maintenance :

```bash
cd /mnt/ssd/config/docker && docker compose up -d
```

Circuit breaker : max 3 tentatives par 24h (compteur `/var/lib/homelab_monitor/autorepair-docker-attempts`). Au 4e, ntfy urgent "autorepair-capped" et stop (force enquête humaine). Opt-out : `touch /var/lib/homelab_monitor/maintenance` avant une maintenance planifiee.

Prouvé en live 2026-04-19 : stack down après recreation loki, auto-repair fire 172s après détection, 13 containers up. Voir log `/var/log/homelab_monitor.log` entry `AUTOREPAIR: docker compose up -d OK`.

:::note[La garde de maintenance était inerte jusqu'au 2026-08-31]
Le contrôle testait `/var/lib/homelab_monitor/maintenance`, alors que
`homelab-maintenance.sh` écrit `/run/homelab/maintenance-until`. Personne
n'écrivait le fichier surveillé : l'opt-out ne fonctionnait pas depuis son ajout
en avril, et l'auto-repair pouvait donc relancer la pile en pleine maintenance
planifiée. Découvert par accident, en ouvrant une vraie fenêtre pour tester
autre chose. Les deux mécanismes sont désormais honorés.

La méthode qui l'a révélé vaut d'être retenue : ne pas tester une garde en
fabriquant sa condition à la main (`touch le_fichier_attendu`) mais en
**déclenchant le vrai mécanisme** que l'opérateur utilise. Le premier prouve
qu'on lit un fichier ; seul le second prouve qu'on lit le bon.
:::

### Fenêtre de maintenance {#fenetre-maintenance}

Avant de travailler physiquement sur la machine, ouvre une fenêtre de silence :

```bash
homelab-maintenance.sh 20      # silence 20 minutes
homelab-maintenance.sh off     # lève la fenêtre immédiatement
homelab-maintenance.sh         # affiche l'état courant
```

Le marqueur vit dans `/run/homelab/maintenance-until`, donc sur **tmpfs, à dessein** : un
mode maintenance oublié ne survit pas à un redémarrage.

**Le périmètre est délibérément étroit.** La fenêtre ne tait que l'**indisponibilité de
service** — `silence loki`, `node_exporter muet`, `crash-loop`, `autoheal`, `5xx spike`
(liste `MAINT_SILENCEABLE`). Jamais le matériel, jamais la sécurité. Une panne disque, une
température ou une tentative d'intrusion pendant une maintenance doivent s'entendre : la
maintenance explique qu'un service redémarre, elle n'explique pas qu'un disque meurt.

:::info[Depuis le 2026-09-22, la fenêtre atteint aussi Grafana]
Elle n'était lue que par `homelab_monitor.sh`. Grafana vit sur un autre hôte (LXC 101) et
l'ignorait totalement : le **2026-09-21**, pendant une fenêtre ouverte pour remplacer le
pontet USB-SATA, Grafana a émis « [FIRING] SSD — évènement hardware » pour un débranchement
parfaitement volontaire.

Le chemin est maintenant : `homelab_monitor.sh` publie `homelab_maintenance_active` via le
collecteur textfile de node_exporter (écriture atomique, à chaque passage) → Prometheus le
scrute déjà → le relais ntfy l'interroge avant de livrer. Pas de nouveau chemin réseau, pas
de nouveau secret.

Deux choix de conception à retenir :

- **En cas de doute on livre.** Prometheus injoignable, JSON inattendu, timeout : la
  fonction rend `False` et la notification part. Un relais qui se tait sur une incertitude
  serait pire que le bruit qu'il évite.
- **Le relais répond `200` quand il tait.** Rendre une erreur ferait réessayer Grafana, puis
  marquer le point de contact en échec : on transformerait un silence **voulu** en panne.
:::

### Reprise du stack après un décrochage SSD {#reprise-ssd}

Deux mécanismes ajoutés le 2026-08-30, après un incident où le SSD a décroché
deux fois et laissé **19 conteneurs sur 24** debout — un état que ni
`check_docker_autorepair` (qui ne vise que le stack *entièrement* vide) ni
`check_docker` (qui se contente d'alerter) ne couvrait.

`revive_docker` — la recovery SSD **déclarait** le redémarrage de Docker sans le
vérifier : `SSD RECOVERY: SUCCESS ... Docker restarted` à 21:14:21, puis
`docker-down` à 21:14:22. Deux causes cumulées :

- `systemctl start docker` est un **no-op** quand l'unité a atteint sa limite de
  redémarrages (« Start request repeated too quickly »). Il faut lever le
  compteur par `systemctl reset-failed docker.service docker.socket` d'abord.
- Rien ne vérifiait que le daemon répondait : un `sleep 10`, puis un log de
  succès.

La fonction fait donc `reset-failed` **avant** `start`, deux passes, et ne rend
un succès que si `docker info` a réellement répondu. Un succès non vérifié est un
mensonge, et celui-là a coûté une nuit de pile à moitié à terre.

`check_containers_restart` — relance les conteneurs arrêtés quand le stack est
*partiel*. Volontairement `docker start` et **jamais** `docker compose up -d` :
`/mnt/ssd/config` est la production (monté `watch: true` dans Traefik), on ne
recrée pas des conteneurs depuis le checkout courant sans le demander. Garde-fous :

- délai de confirmation de 2 min, pour ne pas courir contre un `compose up` ou un
  redémarrage manuel ;
- disjoncteur de 3 relances glissantes par conteneur et par 24 h — au-delà, on
  laisse l'alerte `containers-stopped` faire son travail plutôt que de boucler
  sur un conteneur cassé ;
- exclusions : `IGNORE_STOPPED`, les résidus `<12hex>_<nom>` d'une recréation, et
  l'état `restarting` (le conteneur réessaie déjà seul).

Pas de redémarrage automatique de la machine en dernier recours : si Docker ne
revient pas, alerte `ssd-recovery-docker-failed` en urgent et on s'arrête.
Redémarrer une machine seule sur un défaut matériel intermittent est un mauvais
échange.

Tests : `scripts/tests/ssd-recovery-docker.test.sh`, 27 assertions, chaque garde
vérifiée par mutation. C'est ce qui a rattrapé un délai de confirmation non
couvert — le test sortait par la branche « témoin absent » sans jamais atteindre
le contrôle des 120 s. Validé à chaud : un conteneur arrêté puis relancé par la
vraie fonction contre le vrai Docker.

### House signal (deadman complément HomePod)

`check_house` teste :
1. **Freebox** (192.168.1.254 TCP 80/443) — si KO = LAN segmente / Freebox crashee
2. **Internet** (1.1.1.1 et 9.9.9.9 TCP 53) — si Freebox OK mais ca KO = WAN down ISP

Combinaison avec la notif HomePod d'Apple permet de diagnostiquer sans acces Pi :

| Signal Pi | Notif HomePod | Diagnostic |
|---|---|---|
| Silence radio | Notif recue | **Coupure electrique** (Pi mort) |
| `internet-down` alert | Notif recue | **Coupure ISP** (Pi + Freebox UP, WAN KO) |
| `freebox-down` alert | Notif recue | **Freebox crashee** |
| Alerts normales | Pas de notif | **Problem homelab isolé** |

### Restic repos freshness (multi-repo)

`check_restic_repos_freshness` interroge directement le backend restic — Cloudflare R2 EU depuis le 2026-05-11 — pour les 4 repos backup :

| Repo | Seuil | Source |
|---|---|---|
| `restic` | 30h | penny daily (`homelab_backup.sh` @ 03:00) |
| `restic-vault` | **3h** | LXC 102 vaultwarden (`vault-backup.sh` **hourly**) |
| `restic-dnsfailover` | 30h | LXC 100 AdGuard (`dnsfailover-backup.sh` @ 02:30) |
| `restic-logs` | 30h | LXC 101 Grafana+Loki (`logs-backup.sh` @ 02:45) |

Cache 1h par repo pour ne pas faire 4 round-trips R2 chaque minute. Alerte ntfy `restic-<repo>-stale` si depassement.

### Deduplication des alertes

Le script utilisé des fichiers d'état dans `/var/lib/homelab_monitor/` :

- Une alerte n'est envoyée qu'**une seule fois** par incident
- Une notification **"resolved"** est envoyée quand le problème disparait
- Pas de spam sur ntfy

### Configuration

```bash
NTFY_TOPIC="<topic-randomise>"    # Topic ntfy (hex 32 chars, non public)
NTFY_SERVER="https://ntfy.sh"
TEMP_WARN=70                      # Seuil warning °C
TEMP_CRIT=80                      # Seuil critique °C
```

## Services de monitoring

| Service | Rôle | Acces |
|---|---|---|
| **Beszel** + agents | Monitoring système (CPU, RAM, disque, réseau) — penny, galahad, lancelot | Dashboard web |
| **digest-drift-check** | Notifie quand l'amont `:latest` dépasse le digest `@sha256` épinglé — n'applique **rien**, la mise à jour reste une décision | Timer mensuel / ntfy |
| **homelab_monitor.sh** | Alertes critiques push (SSD, power, temp, Docker) | Notifications ntfy |
| **Watchdog BCM2835** | Reboot auto si kernel freeze (timeout 15s) | Hardware |
| **Autoheal** | Restart auto des containers Docker unhealthy | Container |
| **SSD auto-recovery** | Remount + fsck + restart Docker après déconnexion USB | Script (monitor) |
| **dns-failover health check** | Surveillé penny depuis galahad (ping + Traefik + DNS) | LXC 100 / ntfy |

## Contrôles planifiés (timers penny)

Inventaire relevé sur la machine le **2026-09-24**. Tout ce qui tourne en planifié sur
penny est ici ; les entrées sans lien n'ont pas de page dédiée et le tableau fait
référence.

| Timer | Cadence | Ce qu'il fait |
|---|---|---|
| `claude-remote-watch` | chaque minute | Scrape les évènements de session — voir [claude-remote](../services/claude-remote.md) |
| `smart-textfile-exporter` | toutes les 15 min | Expose la santé SMART du SSD à Prometheus (collecteur textfile) |
| `ci-health-check` | toutes les 30 min | Témoin sur l'état de la CI des dépôts homelab — voir [ci-runner](../services/ci-runner.md) |
| `outillage-health-check` | toutes les 30 min | Disponibilité de l'outillage (Pulse, Grafana, PBS, Portainer…) |
| `apt-listbugs` | horaire (:20) | Nettoie les préférences apt-listbugs qui bloquaient unattended-upgrades |
| `funnel-public-check` | horaire | Le chemin **public** de ntfy est-il joignable ? — voir [ntfy](../services/ntfy.md) |
| `mirror-drift-check` | horaire | Le miroir Forgejo → GitHub prend-il du retard ? — voir [dérive de configuration](derive-configuration.md) |
| `pz-disk-check` | horaire | Espace disque du serveur Project Zomboid |
| `control-drift-check` | toutes les 6 h (00:00) | Vérifie que les contrôles homelab sont réellement en place sur les 3 hôtes |
| `guardrail-liveness` | toutes les 6 h (00:30) | Vérifie que chaque garde-fou a parlé récemment (un garde-fou muet ne se distingue pas d'un garde-fou content) |
| `pz-backup` | toutes les 6 h (00:00) | Sauvegarde de la save Project Zomboid — voir [zomboid](../services/zomboid.md) |
| `lxc-disk-check` | toutes les 6 h (02:00) | Remplissage des rootfs LXC sur les deux nœuds PVE |
| `homelab-backup` | 03:00 | Sauvegarde restic vers R2 — voir [backups](backups.md) |
| `pbs-datastore-sync` | 03:30 | Sync du datastore PBS vers R2 via rclone — voir [backups](backups.md) |
| `ansible-drift-check` | 03:40 | Les deux playbooks en `--check` sur les 3 hôtes : le déployé diverge-t-il du manifeste ? |
| `pbs-snapshot-integrity` | 04:05 | Les snapshots PBS sont-ils **utilisables** (manifeste présent, pas de `.tmp_didx`) — voir [backups](backups.md) |
| `aide-check` | 04:30 | Intégrité des fichiers système (AIDE) — voir [roadmap sécurité](../securite/roadmap.md) |
| `security-updates` | 05:40 | Applique les mises à jour de sécurité (politique unattended-upgrades) |
| `backup-coverage-check` | 06:45 | Quels invités Proxmox n'ont **pas** de sauvegarde récente |
| `repo-drift-check` | 07:10 | Vérifie que le déployé dans la LXC 101 correspond encore au dépôt |
| `argon-evidence-archive` | 07:20 | Archive les évènements de lien USB du SSD (dossier de réclamation Argon 20511) |
| `break-glass-fraicheur` | 09:20 | La copie hors-ligne du coffre est-elle à jour ? — voir [break-glass](break-glass.mdx) |
| `backup-freshness-check` | 09:30 | Dead-man-switch sur la fraîcheur des dépôts restic |
| `rotate-logs-ssd` | dimanche 05:40 | Rotation des journaux applicatifs posés sur le SSD (copie + troncature, jamais renommage) |
| `trivy-scan` | dimanche 06:00 | Scan de vulnérabilités des images Docker qui tournent |
| `lynis-notify` | dimanche 07:15 | Audit lynis de penny + notification ntfy zéro-bruit |
| `lynis-remote-audit` | dimanche 07:45 | Audit lynis des nœuds PVE, en pull depuis penny |
| `restic-check-monthly` | le 1er, 04:20 | Contrôle d'intégrité des dépôts restic (multi-repo R2) |
| `digest-drift-check` | le 1er, 05:00 | Écart entre `:latest` amont et le digest épinglé — voir [décisions](../projet/decisions.md) |
| `restic-drill-monthly` | le 1er, 05:20 | Drill de restauration (4 dépôts + datastore PBS) — voir [DR drill](dr-drill-scenario-1.md) |

`homelab_monitor.sh` n'est pas dans ce tableau : il tourne en **cron chaque minute**, pas en
timer. Les timers ci-dessus sont les contrôles qui coûtent trop cher pour tourner à la minute.

:::tip[Ce tableau est daté à la main, donc il pourrit par défaut]
Entre le relevé du 2026-08-29 et celui-ci, **neuf** timers ont été posés sans que la page
bouge. Plutôt que de croire la date, redérive-la :

```bash
systemctl list-timers --all --no-pager
```

Ce qui garde réellement l'inventaire honnête n'est pas cette page mais
`guardrail-liveness` : un timer absent de son registre peut mourir sans bruit. Le registre
est passé de 14 à 26 entrées les 22 et 24/09 — **dix garde-fous vivaient sans personne pour
constater leur mort**, dont `funnel-public-check`, posé la veille et jamais inscrit.
:::

:::note[Pourquoi des timers et pas du cron]
`Persistent=true` rattrape un passage manqué après une coupure ou un redémarrage. Le drill
du 2026-06-01 avait été **sauté en silence** parce qu'il était en cron : la machine dormait
à l'heure dite et personne ne l'a su. Voir [fiabilisation du drill](../projet/journal/2026-06-11-fiabilisation-drill-restauration.md).
:::

## Architecture de résilience

Trois couches complementaires, chacune couvre des scénarios différents :

| Couche | Outil | Scénario | Action |
|---|---|---|---|
| 1. Monitoring | homelab_monitor.sh | SSD, temp, RAM, disque, containers | Alerte ntfy |
| 2. Auto-repair | Autoheal | Container unhealthy | Restart container |
| 3. Dernier recours | Watchdog hardware | Kernel freeze | Reboot complet |

:::info[Pas de chevauchement]
Le watchdog ne remplacé PAS le monitoring. Si le SSD se deconnecte, le kernel tourne toujours — le watchdog ne se déclenche pas. C'est `homelab_monitor.sh` qui alerte. Les trois couches sont complementaires.
:::

## Dead-man-switch (negative space alerting)

Depuis 2026-06-03 (commit `5db3643`), quatre rules Grafana détectent l'**absence** de logs plutôt que leur présence.

### Pourquoi ce pattern

`homelab_monitor.sh` tourne **sur penny**. Si penny meurt, le moniteur meurt avec lui — et donc personne n'alerte. Observé concrètement entre le 2026-05-31 09:09 et le 2026-06-03 10:13 : 3 jours sans aucune alerte parce que penny était down.

Les rules Grafana classiques (`authelia-failures`, `traefik-5xx`, etc.) regardent toutes la *présence* d'événements anormaux :

```
sum(count_over_time({container="authelia"} |~ "auth fail" [15m])) > 10
```

Si authelia est down → 0 log → seuil pas franchi → silence. Catch-22 : on n'alerte que sur ce qui se passe, pas sur ce qui ne se passe plus.

### Le pattern

```yaml
expr: sum(count_over_time({host="X"}[10m])) or vector(0)
type: threshold
conditions:
  - evaluator: { params: [5], type: lt }
noDataState: Alerting
execErrState: OK
```

- `or vector(0)` : force le retour 0 si Loki ne trouve aucune stream pour le label (sinon NoData casse la reduce stage)
- `type: lt` : on alerte si **moins** de 5 events
- `noDataState: Alerting` : filet de secu si Loki renvoie NoData malgré tout (légitime)
- `execErrState: OK` : silence si Loki lui-même est en erreur

### Rules déployées

| UID | Window | Seuil | Severity |
|---|---|---|---|
| `alert-host-penny-silent` | 10min | < 5 logs | critical |
| `alert-host-galahad-silent` | 10min | < 5 logs | critical |
| `alert-host-lancelot-silent` | 10min | < 5 logs | critical |

**Trois**, pas quatre : `alert-host-sucre-silent` a ete supprimee le 2026-08-26 via un
bloc `deleteRules`, apres avoir envoye 38 notifications en 24 h — un dead-man-switch sur
un service volontairement arrete ne reste pas allume, il **clignote**.

Le motif s'est etendu au-dela du silence d'hote : `alert-node-exporter-down`,
`alert-lynis-silent` et `alert-fs-readonly` relevent de la meme logique d'espace negatif.
Au total **19 regles** sont provisionnees dans
`logs/logs-prod-1/grafana-provisioning/alerting/rules.yml`.

:::danger[Le fichier n'est pas la preuve — la base l'est]
Le 2026-09-25, la base a porte **zero** regle pendant 3 h 30 avec ce fichier intact :
la suppression d'un dossier Grafana avait emporte les dix-neuf. Le provisioning ne
s'applique qu'au demarrage, donc rien ne les a remises.

Compter les regles dans `rules.yml` ne prouve donc rien sur ce qui s'evalue :

```bash
tailscale ssh root@lancelot \
  "pct exec 101 -- sqlite3 /opt/logs/grafana/grafana.db 'SELECT COUNT(*) FROM alert_rule;'"
```

Procedure complete : [supprimer un dossier Grafana emporte ses
regles](incidents-recurrents.md#dossier-grafana-supprime).
:::

### Limite : Loki sur lancelot

Si **lancelot** tombe, Loki primary (LXC 101) tombe aussi → Grafana ne peut plus évaluer ses rules. Filets de secours :

1. **Loki replica sur penny** (port 3101) — reçoit toujours les writes Alloy via dual-write Alloy.
2. **healthchecks.io** sur penny `homelab_monitor.sh` — ping cloud chaque minute, fire ntfy externe à T+5min de silence. Indépendant du cluster.
3. **sucre canary via Tailscale** (commit `fb56f53`) — `monitor.sh` check `sucre.service` par IP Tailscale, bypass Loki.
