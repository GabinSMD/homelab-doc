# Optimisations OS

DietPi sur Raspberry Pi 4 — toutes les optimisations appliquees pour la stabilité SSD, la longevite du stockage et l'economie de ressources.

## Stabilité SSD (bridge USB-SATA ASMedia ASM1156)

:::danger[Problème]
Le boitier Argon ONE M.2 utilisé un bridge ASMedia ASM1156 (USB-to-SATA) qui est sujet a des **déconnexions aléatoires** sur RPi 4 a cause de la gestion d'énergie PCIe.
:::

### Paramètres kernel (`cmdline.txt`)

```bash
pcie_aspm=off                       # Desactive PCIe ASPM (cause principale des decos)
usbcore.autosuspend=-1              # Desactive USB autosuspend
usb-storage.quirks=174c:1156:u      # Force usb-storage au lieu de UAS pour ce device
```

### Règles udev

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

:::info[Points clés]
- `noatime,lazytime` sur toutes les partitions — réduit les ecritures
- `nofail` sur le SSD — le système boot même si le SSD n'est pas branche
- `errors=remount-ro` — protégé le filesystem en cas d'erreur I/O
- Pas de swap (swappiness=1)
:::

## Headless / economie de ressources

### config.txt

Relevé le 2026-09-24 sur `/boot/firmware/config.txt` :

```ini
max_framebuffers=1          # UNE console : voir l'encadre ci-dessous
hdmi_blanking=1             # Standby HDMI
disable_overscan=1
disable_splash=1            # Pas de splash screen
dtparam=audio=off           # Pas d'audio
gpu_mem_256=16              # GPU minimal
gpu_mem_512=16
gpu_mem_1024=16
dtoverlay=disable-wifi      # WiFi desactive
dtparam=sd_poll_once        # Pas de polling SD continu
enable_uart=1               # Console serie active (debug)
arm_64bit=1
temp_limit=75               # Throttle thermique
initial_turbo=20
dtparam=i2c_arm=on          # I2C pour le ventilateur Argon
dtparam=watchdog=on         # Watchdog materiel BCM2835, voir plus bas
dtoverlay=ramoops-pi4,total-size=131072,console-size=65536
```

:::info[Pourquoi `max_framebuffers=1` et pas `0` — tranché le 2026-09-23]
Ces deux lignes ont longtemps été `max_framebuffers=0` et `hdmi_ignore_hotplug=1`, au nom
de l'économie de RAM GPU sur une machine sans tête. Elles ont été retirées **exprès**.

Ensemble, elles coupent la sortie HDMI même écran branché et suppriment la console : elles
retirent le **seul chemin de diagnostic** quand la machine ne démarre plus et que SSH est
inaccessible. C'est exactement le scénario vécu les **2026-04-17, 2026-08-03 et
2026-08-25**.

Le bon critère n'est pas l'économie, c'est la **récupérabilité**. Un serveur sans tête n'a
pas besoin d'écran au quotidien ; il en a besoin le jour où tout le reste est tombé.
Quelques Mo de RAM GPU ne valent pas ça.
:::

`dtoverlay=ramoops-pi4` mérite d'être remarqué : il réserve 128 Kio de RAM persistante
pour `pstore`. C'est le **seul témoin d'un kernel Oops**, qui par nature n'atteint jamais
le journal sur disque — voir [où est la preuve d'une
chute](../operations/incidents-recurrents.md#chute-lancelot-preuve).

## Docker

### daemon.json

```json
{
    "data-root": "/mnt/ssd/docker",
    "log-driver": "json-file",
    "log-opts": { "max-size": "10m", "max-file": "3" },
    "log-level": "warn",
    "debug": false,
    "icc": false,
    "no-new-privileges": true
}
```

- `data-root` sur le SSD — images, volumes, et overlays sur le disque rapide
- `log-driver: json-file` avec `log-opts` — **30 Mo maximum par conteneur**
  (3 fichiers de 10 Mo). Sans cette limite, un conteneur bavard remplit son hôte :
  Pulse est resté mort 3 jours et demi derrière un `json.log` de 982 Mo. La limite
  ne s'applique qu'aux conteneurs **recréés**, pas à ceux déjà en marche.
- `log-level: warn` — limité le bruit dans les logs
- `icc: false` — inter-container communication OFF sur bridge par defaut (sécurité)
- `no-new-privileges: true` — empeche l'escalade de privileges dans les containers

Pour les mesures de hardening Docker detaillees (cap_drop, read_only, socket-proxy), voir [hardening.md](../securite/hardening.md#docker-tous-containers).


:::warning[Pourquoi plus journald]
Le driver a longtemps ete `journald`, sur le raisonnement « les logs vont en
tmpfs, donc pas d'usure SD ». Deux choses l'ont invalide. D'abord le
`/var/log` en tmpfs de DietPi est **purge chaque heure** : les logs de conteneur
n'y survivaient pas assez pour servir a un post-mortem. Ensuite, journald sur ARM
a un bug recurrent de SIGBUS entre lecteur et ecrivain sur les fichiers mmap —
il a tue `dockerd` lui-meme. Le correctif de classe a ete de sortir du chemin
journald, et la limite de taille remplace la protection que tmpfs offrait.
:::

## Watchdog hardware (BCM2835)

Le RPi 4 intégré un watchdog hardware qui reboot automatiquement la machine si le kernel freeze.

### Fonctionnement

Le daemon `watchdog` alimente `/dev/watchdog` toutes les secondes. Si le kernel gele et que le daemon ne peut plus ecrire pendant 15 secondes, le timer hardware force un reboot electrique.

### Configuration

**`/boot/firmware/config.txt` :**

```ini
dtparam=watchdog=on
```

**`/etc/modules` :**

```text
i2c-bcm2708      # ventilateur Argon
i2c-dev
bcm2835_wdt      # le watchdog
```

**`/etc/watchdog.conf` (extrait) :**

```ini
watchdog-device   = /dev/watchdog
watchdog-timeout  = 15
max-load-1        = 24
interface         = eth0
realtime          = yes
priority          = 1
verbose           = yes    # 2026-08-27 : dire POURQUOI il reset
logtick           = 60
```

### Rendre la raison du reset lisible

Le watchdog a un défaut structurel : il **convertit n'importe quel figeage en
reset**, et le reset efface la preuve de ce qui figeait. Sans précaution, on
récupère une machine saine et aucune explication — c'est ce qui a laissé le
reset du 2026-08-26 sans cause.

Deux dispositifs y répondent, et ils sont complémentaires :

| Dispositif | Ce qu'il apporte | Limite |
|---|---|---|
| `verbose` + `logtick` | la raison invoquée par le daemon, expédiée par syslog → journald → Alloy → **Loki**, qui vit hors de penny | suppose que la chaîne d'expédition tourne encore |
| `dtoverlay=ramoops-pi4` | le tampon `dmesg` en RAM réservée, **survit au reset** et est archivé au boot suivant | ne dit rien si le kernel n'a rien écrit |

```ini
# /boot/firmware/config.txt — console-size par défaut vaut 0,
# sans lui ramoops ne capture QUE les panics
dtoverlay=ramoops-pi4,total-size=131072,console-size=65536
```

La méthode complète de diagnostic après un reset — dont le piège `fake-hwclock`
qui fausse tous les horodatages de boot — est dans
[penny reset en dur, sans rien dans le journal](../operations/depannage.md#penny-reset-en-dur-sans-rien-dans-le-journal).

### Ce que le watchdog couvre et ne couvre PAS

| Scénario | Couvert ? | Pourquoi |
|---|---|---|
| Kernel freeze / panic | Oui | Le daemon ne peut plus alimenter le timer |
| Load moyenne > 24 | Oui | Le daemon détecté et reboot |
| Interface eth0 down | Oui | Le daemon détecté et reboot |
| Épuisement mémoire | **Indirectement** | Il reset la machine figée, mais sans dire pourquoi — bornes cgroup et enregistreur de vol depuis le 2026-08-27 |
| Déconnexion SSD | **Non** | Le kernel tourne toujours, seul Docker est impacte |
| Container crash | **Non** | Couvert par autoheal + homelab_monitor.sh |
| Temperature critique | **Non** | Couvert par homelab_monitor.sh |

:::warning[Le watchdog ne remplacé pas le monitoring]
Le watchdog est le **dernier recours** (le kernel est mort). Le script `homelab_monitor.sh` est la **première ligne** (quelque chose va mal mais le système tourne encore). Les deux sont complementaires.
:::

### Vérification

```bash
# Etat du watchdog
systemctl status watchdog
cat /sys/class/watchdog/watchdog0/state    # "active" = alimente

# Test (ATTENTION : reboot immediat en ~15s)
echo c > /proc/sysrq-trigger              # Provoque un kernel panic
```

## Docker : healthchecks et autoheal

### Healthchecks

Les containers avec healthcheck sont surveilles par Docker. Si un check échoué 3 fois de suite, le container passe en `unhealthy`.

Relevé le 2026-09-24 (`docker inspect --format '{{if .Config.Healthcheck}}…'`).
**12 conteneurs sur 22** en ont un.

| Conteneur | Healthcheck |
|---|---|
| Traefik | `wget http://localhost:8080/ping` — endpoint `/ping` activé dans `traefik.yml` |
| AdGuard | `wget http://localhost:3000` — interface web |
| Authelia, Homepage, Outline, outline-db, outline-redis | Intégré à l'image |
| CrowdSec, Portainer, Beszel, beszel-agent, autoheal, socket-proxy | Intégré à l'image |

Les **10 sans healthcheck** : `ntfy`, `forgejo`, `dozzle`, `cyberchef`, `stirling-pdf`,
`status`, `homelable`, `homelable-backend`, `loki-replica`, et donc rien ne les fait
redémarrer par autoheal. Ils sont couverts par `homelab_monitor.sh` (le conteneur est-il
là ?) et, pour ceux exposés par Traefik, par `outillage-health-check`.

:::note[Un conteneur sans healthcheck est invisible pour autoheal]
`AUTOHEAL_CONTAINER_LABEL: all` ne veut pas dire « tous les conteneurs » : autoheal ne
peut agir que sur ceux que Docker sait marquer `unhealthy`. Sur un conteneur sans
healthcheck, un processus mort mais un PID 1 vivant ne déclenche **rien**.
:::

### Autoheal

Le container `willfarrell/autoheal` surveillé tous les containers toutes les 30 secondes. Si un container est `unhealthy`, il le restart automatiquement.

```yaml
autoheal:
  image: willfarrell/autoheal
  environment:
    AUTOHEAL_CONTAINER_LABEL: all
    AUTOHEAL_INTERVAL: 30
    DOCKER_SOCK: tcp://socket-proxy:2375   # PAS le socket en direct
  networks: [socket]
```

:::warning[Autoheal ne monte pas `/var/run/docker.sock`]
Il passe par `socket-proxy` en TCP, comme Traefik, Homepage et Dozzle. Les seuls
conteneurs qui montent le socket **en direct** sont `portainer` (nécessité admin),
`beszel-agent` (lecture des métriques de conteneur) et `socket-proxy` lui-même.

```bash
# Redériver la liste plutot que la croire
for c in $(docker ps --format '{{.Names}}'); do
  docker inspect "$c" --format '{{range .Mounts}}{{.Source}} {{end}}' \
    | grep -q /var/run/docker.sock && echo "$c"
done
```
:::

## Résumé

| Optimisation | Effet |
|---|---|
| PCIe ASPM off | Empeche les déconnexions SSD |
| USB autosuspend off | Double protection SSD |
| UAS désactivé | Force `usb-storage` (plus stable) |
| SSD non-rotational | I/O scheduler optimise |
| Logs Docker plafonnes (30 Mo/conteneur) | Un conteneur bavard ne remplit plus l'hote |
| Logs systeme en tmpfs | Pas d'usure SD |
| Swap désactivé | Pas d'usure SSD/SD |
| GPU 16 Mo | Plus de RAM pour les services |
| Headless, mais **une** console | Diagnostic possible quand SSH est mort |
| WiFi off | Economie énergie, sécurité |
| `fstrim.timer` hebdo (lundi 00:00) | **Sans effet sur le SSD** — voir ci-dessous |
| Watchdog BCM2835 | Reboot auto si kernel freeze (15s) |
| Healthchecks Docker | Détection containers zombie |
| Autoheal | Restart auto des containers unhealthy |

## Limités connues

:::note[Limitations hardware du bridge ASMedia]
- **TRIM non supporte** (`discard_max_bytes=0`) — le garbage collection interne du SSD compense
- **USB 3.0 plafonne a ~200 MB/s** — bus partagé avec Ethernet Gigabit sur RPi 4
- **`nr_requests=2`** — limitation du driver `usb-storage`, non modifiable sans UAS
:::

:::warning[`fstrim.timer` tourne chaque lundi et ne trime rien]
Les deux affirmations de cette page se contredisaient : le résumé annonçait « fstrim hebdo
— maintenance SSD », l'encadré ci-dessus dit que le bridge ne passe pas TRIM. C'est
l'encadré qui a raison.

```console
$ cat /sys/block/sda/queue/discard_max_bytes
0
```

Le timer est actif (`Mon *-*-* 00:00:00`) et s'exécute sans erreur — il ne trouve
simplement aucun périphérique à trimer. Il n'est pas nuisible, mais **ce n'est pas une
mesure d'entretien du SSD** : compter dessus, c'est croire à un entretien qui n'a pas
lieu. L'usure du SSD est gérée par son garbage collection interne, pas par l'hôte.

Le TRIM qui compte réellement dans ce parc est ailleurs : `pct fstrim` sur les rootfs LXC
des nœuds PVE, sans lequel l'espace libéré dans un conteneur ne revient jamais à l'hôte.
:::
