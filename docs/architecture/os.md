# Optimisations OS

DietPi sur Raspberry Pi 4 — toutes les optimisations appliquees pour la stabilite SSD, la longevite du stockage et l'economie de ressources.

## Stabilite SSD (bridge USB-SATA ASMedia ASM1156)

!!! danger "Probleme"
    Le boitier Argon ONE M.2 utilise un bridge ASMedia ASM1156 (USB-to-SATA) qui est sujet a des **deconnexions aleatoires** sur RPi 4 a cause de la gestion d'energie PCIe.

### Parametres kernel (`cmdline.txt`)

```bash
pcie_aspm=off                       # Desactive PCIe ASPM (cause principale des decos)
usbcore.autosuspend=-1              # Desactive USB autosuspend
usb-storage.quirks=174c:1156:u      # Force usb-storage au lieu de UAS pour ce device
```

### Regles udev

`/etc/udev/rules.d/50-argon-ssd.rules` :

```bash
# Desactive autosuspend pour le bridge ASMedia
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="174c", ATTR{idProduct}=="1156", \
  ATTR{power/control}="on", ATTR{power/autosuspend_delay_ms}="-1"

# Desactive autosuspend sur le hub USB 2.0 VIA Labs parent
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="2109", ATTR{idProduct}=="3431", \
  ATTR{power/control}="on", ATTR{power/autosuspend_delay_ms}="-1"

# Marque le SSD comme non-rotational (le bridge USB ne transmet pas cette info)
ACTION=="add|change", KERNEL=="sd[a-z]", ATTRS{idVendor}=="174c", ATTRS{idProduct}=="1156", \
  ATTR{queue/rotational}="0"
```

## Montage et filesystem

### fstab

```bash
# Tmpfs pour les logs (evite l'usure SD)
tmpfs /tmp     tmpfs size=3929M,noatime,lazytime,nodev,nosuid,mode=1777
tmpfs /var/log tmpfs size=50M,noatime,lazytime,nodev,nosuid

# SD Card
PARTUUID=503f5518-02 /               ext4 noatime,lazytime,rw                    0 1
PARTUUID=503f5518-01 /boot/firmware   vfat noatime,lazytime,rw                    0 2

# SSD (nofail = boot meme si SSD absent, errors=remount-ro = protection donnees)
UUID=b32ed1bb-... /mnt/ssd ext4 noatime,lazytime,rw,nofail,errors=remount-ro
```

!!! info "Points cles"
    - `noatime,lazytime` sur toutes les partitions — reduit les ecritures
    - `nofail` sur le SSD — le systeme boot meme si le SSD n'est pas branche
    - `errors=remount-ro` — protege le filesystem en cas d'erreur I/O
    - Pas de swap (swappiness=1)

## Headless / economie de ressources

### config.txt

```ini
max_framebuffers=0          # Pas de framebuffer (headless)
hdmi_ignore_hotplug=1       # Ignore HDMI meme si branche
hdmi_blanking=1             # Standby HDMI
disable_splash=1            # Pas de splash screen
dtparam=audio=off           # Pas d'audio
gpu_mem_256=16              # GPU minimal
gpu_mem_512=16
gpu_mem_1024=16
dtoverlay=disable-wifi      # WiFi desactive
dtparam=sd_poll_once        # Pas de polling SD continu
enable_uart=1               # Console serie active (debug)
dtparam=i2c_arm=on          # I2C pour le ventilateur Argon
```

## Docker

### daemon.json

```json
{
    "data-root": "/mnt/ssd/docker",
    "log-driver": "journald",
    "log-level": "warn",
    "debug": false,
    "icc": false,
    "no-new-privileges": true
}
```

- `data-root` sur le SSD — images, volumes, et overlays sur le disque rapide
- `log-driver: journald` — logs dans journald (en tmpfs via DietPi), pas sur disque
- `log-level: warn` — limite le bruit dans les logs
- `icc: false` — inter-container communication OFF sur bridge par defaut (securite)
- `no-new-privileges: true` — empeche l'escalade de privileges dans les containers

Pour les mesures de hardening Docker detaillees (cap_drop, read_only, socket-proxy), voir [hardening.md](../securite/hardening.md#docker-tous-containers).

## Watchdog hardware (BCM2835)

Le RPi 4 integre un watchdog hardware qui reboot automatiquement la machine si le kernel freeze.

### Fonctionnement

Le daemon `watchdog` alimente `/dev/watchdog` toutes les secondes. Si le kernel gele et que le daemon ne peut plus ecrire pendant 15 secondes, le timer hardware force un reboot electrique.

### Configuration

**`/boot/firmware/config.txt` :**

```ini
dtparam=watchdog=on
```

**`/etc/modules` :**

```
bcm2835_wdt
```

**`/etc/watchdog.conf` (extrait) :**

```ini
watchdog-device   = /dev/watchdog
watchdog-timeout  = 15
max-load-1        = 24
interface         = eth0
realtime          = yes
priority          = 1
```

### Ce que le watchdog couvre et ne couvre PAS

| Scenario | Couvert ? | Pourquoi |
|---|---|---|
| Kernel freeze / panic | Oui | Le daemon ne peut plus alimenter le timer |
| Load moyenne > 24 | Oui | Le daemon detecte et reboot |
| Interface eth0 down | Oui | Le daemon detecte et reboot |
| Deconnexion SSD | **Non** | Le kernel tourne toujours, seul Docker est impacte |
| Container crash | **Non** | Couvert par autoheal + homelab_monitor.sh |
| Temperature critique | **Non** | Couvert par homelab_monitor.sh |

!!! warning "Le watchdog ne remplace pas le monitoring"
    Le watchdog est le **dernier recours** (le kernel est mort). Le script `homelab_monitor.sh` est la **premiere ligne** (quelque chose va mal mais le systeme tourne encore). Les deux sont complementaires.

### Verification

```bash
# Etat du watchdog
systemctl status watchdog
cat /sys/class/watchdog/watchdog0/state    # "active" = alimente

# Test (ATTENTION : reboot immediat en ~15s)
echo c > /proc/sysrq-trigger              # Provoque un kernel panic
```

## Docker : healthchecks et autoheal

### Healthchecks

Les containers avec healthcheck sont surveilles par Docker. Si un check echoue 3 fois de suite, le container passe en `unhealthy`.

| Container | Healthcheck | Methode |
|---|---|---|
| Traefik | `wget http://localhost:8080/ping` | Endpoint `/ping` active dans traefik.yml |
| AdGuard | `wget http://localhost:3000` | Interface web |
| Tailscale | `tailscale status` | CLI interne |
| Vaultwarden | Healthcheck integre a l'image | — |
| Homepage | Healthcheck integre a l'image | — |
| Authelia | Healthcheck integre a l'image | — |
| Watchtower | Healthcheck integre a l'image | — |
| Portainer | Aucun (image distroless) | Surveille par homelab_monitor.sh |
| Beszel | Aucun (image distroless) | Surveille par homelab_monitor.sh |

### Autoheal

Le container `willfarrell/autoheal` surveille tous les containers toutes les 30 secondes. Si un container est `unhealthy`, il le restart automatiquement.

```yaml
autoheal:
  image: willfarrell/autoheal
  environment:
    AUTOHEAL_CONTAINER_LABEL: all
    AUTOHEAL_INTERVAL: 30
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

## Resume

| Optimisation | Effet |
|---|---|
| PCIe ASPM off | Empeche les deconnexions SSD |
| USB autosuspend off | Double protection SSD |
| UAS desactive | Force `usb-storage` (plus stable) |
| SSD non-rotational | I/O scheduler optimise |
| Logs en tmpfs | Pas d'usure SD |
| Swap desactive | Pas d'usure SSD/SD |
| GPU 16 Mo | Plus de RAM pour les services |
| Headless | Framebuffers a 0 |
| WiFi off | Economie energie, securite |
| fstrim hebdo | Maintenance SSD |
| Watchdog BCM2835 | Reboot auto si kernel freeze (15s) |
| Healthchecks Docker | Detection containers zombie |
| Autoheal | Restart auto des containers unhealthy |

## Limites connues

!!! note "Limitations hardware du bridge ASMedia"
    - **TRIM non supporte** (`discard_max_bytes=0`) — le garbage collection interne du SSD compense
    - **USB 3.0 plafonne a ~200 MB/s** — bus partage avec Ethernet Gigabit sur RPi 4
    - **`nr_requests=2`** — limitation du driver `usb-storage`, non modifiable sans UAS
