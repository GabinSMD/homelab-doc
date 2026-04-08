# Maintenance

Procedures de maintenance et depannage courant.

## Mises a jour

### DietPi

```bash
dietpi-update          # Met a jour DietPi + paquets
apt update && apt upgrade  # Mises a jour manuelles
```

### Docker images

```bash
cd /mnt/ssd/config
docker compose pull    # Telecharge les nouvelles images
docker compose up -d   # Redeploy avec les nouvelles images
docker image prune -f  # Supprime les anciennes images
```

!!! tip "WUD surveille les mises a jour"
    What's Up Docker (WUD) detecte automatiquement les nouvelles versions d'images et affiche les mises a jour disponibles sur son dashboard.

### Firmware RPi

```bash
rpi-eeprom-update      # Verifie les mises a jour firmware
rpi-update             # Met a jour le firmware (attention, peut casser)
```

!!! danger "Attention"
    `rpi-update` installe le firmware bleeding-edge. Preferer `apt upgrade` pour les mises a jour stables du kernel.

## Depannage

### Le SSD a deconnecte

**Symptomes** : erreurs I/O, filesystem en read-only, services Docker down.

1. Verifier dmesg :
```bash
dmesg | grep -iE "usb.*(disconnect|error|reset)|sda|I/O"
```

2. Verifier le montage :
```bash
mountpoint /mnt/ssd && echo "OK" || echo "DEMONTE"
mount | grep ssd
```

3. Si demonte, remonter :
```bash
mount /mnt/ssd
systemctl restart docker
```

4. Si read-only :
```bash
mount -o remount,rw /mnt/ssd
```

5. Verifier les fixes ASPM :
```bash
cat /sys/module/pcie_aspm/parameters/policy  # Doit montrer [default]
cat /boot/firmware/cmdline.txt               # Doit contenir pcie_aspm=off
```

!!! info "Cause probable"
    Si les deconnexions reviennent, verifier que les parametres kernel (`pcie_aspm=off`, `usbcore.autosuspend=-1`, `usb-storage.quirks=174c:1156:u`) sont bien dans `cmdline.txt`. Verifier aussi l'alimentation (sous-voltage via `vcgencmd get_throttled`).

### Un container ne demarre pas

```bash
docker ps -a                              # Voir l'etat de tous les conteneurs
docker logs <container_name> --tail 50    # Derniers logs
docker compose up -d <service_name>       # Relancer un service specifique
```

### Temperature elevee

```bash
vcgencmd measure_temp                     # Temperature actuelle
vcgencmd get_throttled                    # 0x0 = tout va bien
```

| Valeur throttled | Signification |
|---|---|
| `0x0` | OK |
| `0x50000` | Throttling dans le passe |
| `0x50005` | Throttling actif + sous-voltage |

Si la temperature est elevee, verifier que le ventilateur Argon fonctionne (`systemctl status argononed`).

### Espace disque

```bash
df -h                    # Vue d'ensemble
docker system df         # Espace utilise par Docker
docker system prune -f   # Nettoyer images/volumes inutilises
```

## Verification post-reboot

Checklist apres un reboot :

- [ ] SSD monte sur `/mnt/ssd` en rw
- [ ] `pcie_aspm=off` actif (`dmesg | grep "PCIe ASPM"`)
- [ ] USB autosuspend a -1 (`cat /sys/bus/usb/devices/*/power/autosuspend`)
- [ ] Quirks USB appliques (`dmesg | grep "Quirks match"`)
- [ ] Tous les containers Docker up (`docker ps`)
- [ ] Pas de throttling (`vcgencmd get_throttled` = `0x0`)
- [ ] Temperature normale (`vcgencmd measure_temp` < 70°C)
