# Optimisations OS - DietPi sur RPi 4

## Stabilite SSD (bridge USB-SATA ASMedia ASM1156)

Le boitier Argon ONE M.2 utilise un bridge ASMedia ASM1156 (USB-to-SATA) qui est
sujet a des deconnexions aleatoires sur RPi 4 a cause de la gestion d'energie PCIe.

### Parametres kernel (`cmdline.txt`)

```
pcie_aspm=off                       # Desactive PCIe ASPM (cause principale des decos)
usbcore.autosuspend=-1              # Desactive USB autosuspend
usb-storage.quirks=174c:1156:u      # Force usb-storage au lieu de UAS pour ce device
```

### Regles udev (`/etc/udev/rules.d/50-argon-ssd.rules`)

```udev
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

```fstab
# Tmpfs pour les logs (evite l'usure SD)
tmpfs /tmp     tmpfs size=3929M,noatime,lazytime,nodev,nosuid,mode=1777
tmpfs /var/log tmpfs size=50M,noatime,lazytime,nodev,nosuid

# SD Card
PARTUUID=503f5518-02 /               ext4 noatime,lazytime,rw                    0 1
PARTUUID=503f5518-01 /boot/firmware   vfat noatime,lazytime,rw                    0 2

# SSD (nofail = boot meme si SSD absent, errors=remount-ro = protection donnees)
UUID=b32ed1bb-5c25-4b68-9466-92537ea2f95c /mnt/ssd ext4 noatime,lazytime,rw,nofail,errors=remount-ro
```

Points cles :
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

### daemon.json (`/etc/docker/daemon.json`)

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

## Reseau

### /etc/network/interfaces

```
allow-hotplug eth0
iface eth0 inet static
  address 192.168.1.28
  netmask 255.255.255.0
  gateway 192.168.1.254
```

WiFi desactive au niveau overlay ET interface.

## Limites connues

- **TRIM non supporte** par le bridge ASMedia USB-SATA (`discard_max_bytes=0`).
  Le timer `fstrim` tourne mais sans effet. Le garbage collection interne du SSD
  compense, mais la performance peut se degrader legerement avec le temps sur un
  SSD tres rempli.
- **USB 3.0 plafonne a ~200 MB/s** sur RPi 4 (bus partage avec Ethernet Gigabit).
  C'est le maximum atteignable, pas un probleme de config.
- **`nr_requests=2`** — limitation du driver `usb-storage` (queue depth faible).
  Non modifiable sans passer a UAS, qui est instable sur ce bridge.
