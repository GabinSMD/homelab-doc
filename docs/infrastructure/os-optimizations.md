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
    "debug": false
}
```

- `data-root` sur le SSD — images, volumes, et overlays sur le disque rapide
- `log-driver: journald` — logs dans journald (en tmpfs via DietPi), pas sur disque
- `log-level: warn` — limite le bruit dans les logs

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

## Limites connues

!!! note "Limitations hardware du bridge ASMedia"
    - **TRIM non supporte** (`discard_max_bytes=0`) — le garbage collection interne du SSD compense
    - **USB 3.0 plafonne a ~200 MB/s** — bus partage avec Ethernet Gigabit sur RPi 4
    - **`nr_requests=2`** — limitation du driver `usb-storage`, non modifiable sans UAS
