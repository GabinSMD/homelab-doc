# Monitoring

## Vue d'ensemble

```mermaid
graph TD
    Script[homelab_monitor.sh<br/>cron 1min] -->|push| Ntfy[ntfy.sh<br/>Notifications]
    Beszel[Beszel Server] -->|dashboard| Web[Interface web]
    WT[Watchtower] -->|verifie| Docker[Images Docker]
    
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

Script bash executé **chaque minute** via cron. Surveille :

| Check | Seuil | Alerte |
|---|---|---|
| SSD monte | `/mnt/ssd` absent | :octicons-alert-16: critique |
| SSD lisible | Erreur I/O | :octicons-alert-16: critique |
| SSD read-only | Remonte en ro | :octicons-alert-16: critique |
| USB errors dans dmesg | Disconnect/offline | :octicons-alert-16: haute |
| Temperature | > 70°C warning, > 80°C critique | :octicons-alert-16: variable |
| Alimentation | Throttling / under-voltage | :octicons-alert-16: haute |
| Espace disque SD/SSD | > 80% warning, > 95% critique | :octicons-alert-16: variable |
| RAM + OOM kill | > 90% ou OOM detecte | :octicons-alert-16: critique |
| Docker daemon | Ne repond plus | :octicons-alert-16: critique |
| Containers | Stopped / unhealthy | :octicons-alert-16: haute |
| **Auto-repair docker** | Stack vide + daemon UP > 2 min | :octicons-alert-16: info (wrench) |
| **House alive** | Freebox injoignable TCP 80/443 | :octicons-alert-16: urgent |
| **Internet reach** | 1.1.1.1 + 9.9.9.9 TCP 53 KO | :octicons-alert-16: haute |
| **Cluster hosts** | galahad/lancelot ping + SSH port | :octicons-alert-16: urgent |
| **Logs stack** | Grafana + Loki HTTP 200 | :octicons-alert-16: haute |
| **AdGuard sync** | Canary rewrite secondaire | :octicons-alert-16: haute |
| **Restic freshness** | 4 repos B2 (3h vault, 30h autres) | :octicons-alert-16: urgent |
| **PBS health** | LXC 103 API :8007 | :octicons-alert-16: urgent |

### Cascade suppression (depuis 2026-04-19)

Quand une alerte parente explique plusieurs enfants, le monitor **supprime** les alertes redondantes pour eviter le spam :

| Si | Alerte(s) supprimee(s) | Justification |
|---|---|---|
| `house-down` (Freebox ou internet KO) | `cluster-hosts` (galahad/lancelot), `logs-stack`, `pbs-down` | Pas joignable car la maison est down |
| `lancelot-down` | `logs-stack`, `pbs-down` | Les 2 LXC (101, 103) vivent sur lancelot |

Le log `(suppressed: parent-flag)` montre la suppression. Tu ne recois qu'**une** notification au lieu de 4 pour le meme incident cause-racine.

### Auto-repair docker

`check_docker_autorepair` — si `docker info` OK + `docker ps -q` vide depuis > 2 min + pas de flag maintenance :

```bash
cd /mnt/ssd/config/docker && docker compose up -d
```

Circuit breaker : max 3 tentatives par 24h (compteur `/var/lib/homelab_monitor/autorepair-docker-attempts`). Au 4e, ntfy urgent "autorepair-capped" et stop (force enquete humaine). Opt-out : `touch /var/lib/homelab_monitor/maintenance` avant une maintenance planifiee.

Prouve en live 2026-04-19 : stack down apres recreation loki, auto-repair fire 172s apres detection, 13 containers up. Voir log `/var/log/homelab_monitor.log` entry `AUTOREPAIR: docker compose up -d OK`.

### House signal (deadman complement HomePod)

`check_house` teste :
1. **Freebox** (192.168.1.254 TCP 80/443) — si KO = LAN segmente / Freebox crashee
2. **Internet** (1.1.1.1 et 9.9.9.9 TCP 53) — si Freebox OK mais ca KO = WAN down ISP

Combinaison avec la notif HomePod d'Apple permet de diagnostiquer sans acces Pi :

| Signal Pi | Notif HomePod | Diagnostic |
|---|---|---|
| Silence radio | Notif recue | **Coupure electrique** (Pi mort) |
| `internet-down` alert | Notif recue | **Coupure ISP** (Pi + Freebox UP, WAN KO) |
| `freebox-down` alert | Notif recue | **Freebox crashee** |
| Alerts normales | Pas de notif | **Problem homelab isole** |

### Restic repos freshness (multi-repo)

`check_restic_repos_freshness` queries B2 directement pour les 4 repos backup :

| Repo | Seuil | Source |
|---|---|---|
| `restic` | 30h | penny daily (`homelab_backup.sh` @ 03:00) |
| `restic-vault` | **3h** | LXC 102 vaultwarden (`vault-backup.sh` **hourly**) |
| `restic-dnsfailover` | 30h | LXC 100 AdGuard (`dnsfailover-backup.sh` @ 02:30) |
| `restic-logs` | 30h | LXC 101 Grafana+Loki (`logs-backup.sh` @ 02:45) |

Cache 1h par repo pour ne pas faire 4 round-trips B2 chaque minute. Alerte ntfy `restic-<repo>-stale` si depassement.

### Deduplication des alertes

Le script utilise des fichiers d'etat dans `/var/lib/homelab_monitor/` :

- Une alerte n'est envoyee qu'**une seule fois** par incident
- Une notification **"resolved"** est envoyee quand le probleme disparait
- Pas de spam sur ntfy

### Configuration

```bash
NTFY_TOPIC="<topic-randomise>"    # Topic ntfy (hex 32 chars, non public)
NTFY_SERVER="https://ntfy.sh"
TEMP_WARN=70                      # Seuil warning °C
TEMP_CRIT=80                      # Seuil critique °C
```

## Services de monitoring

| Service | Role | Acces |
|---|---|---|
| **Beszel** + agents | Monitoring systeme (CPU, RAM, disque, reseau) — penny, galahad, lancelot | Dashboard web |
| **Watchtower** | Auto-update non-critiques + notification mises a jour critiques via ntfy | Headless (pas de dashboard) |
| **homelab_monitor.sh** | Alertes critiques push (SSD, power, temp, Docker) | Notifications ntfy |
| **Watchdog BCM2835** | Reboot auto si kernel freeze (timeout 15s) | Hardware |
| **Autoheal** | Restart auto des containers Docker unhealthy | Container |
| **SSD auto-recovery** | Remount + fsck + restart Docker apres deconnexion USB | Script (monitor) |
| **dns-failover health check** | Surveille penny depuis galahad (ping + Traefik + DNS) | LXC 100 / ntfy |

## Architecture de resilience

Trois couches complementaires, chacune couvre des scenarios differents :

| Couche | Outil | Scenario | Action |
|---|---|---|---|
| 1. Monitoring | homelab_monitor.sh | SSD, temp, RAM, disque, containers | Alerte ntfy |
| 2. Auto-repair | Autoheal | Container unhealthy | Restart container |
| 3. Dernier recours | Watchdog hardware | Kernel freeze | Reboot complet |

!!! info "Pas de chevauchement"
    Le watchdog ne remplace PAS le monitoring. Si le SSD se deconnecte, le kernel tourne toujours — le watchdog ne se declenche pas. C'est `homelab_monitor.sh` qui alerte. Les trois couches sont complementaires.
