# Procedure Break-Glass

Document de reconstruction si le homelab est detruit (incendie, foudre, defaillance double).

**RTO cible** : 4h de zero a fonctionnel (services critiques seulement).

**Prerequis** : Vaultwarden accessible (app mobile offline ou export papier).

---

## Ce qu'il faut avoir AVANT l'incident

### Stockage hors-ligne (coffre / lieu separe)

- [ ] Cle USB chiffree contenant :
  - Export Bitwarden/Vaultwarden chiffre (master password imprime separement)
  - `.restic-env` (credentials B2 + password restic)
  - Cles SSH privees (passphrase obligatoire, idealement YubiKey)
  - Snapshot du repo git `homelab-config` (zip)
- [ ] Papier dans un coffre :
  - Master password Vaultwarden
  - Master password cle USB
  - Restic repository password (backup redondant)

### Comptes externes actifs

- [ ] Backblaze B2 : bucket `gabin-homelab-backups` + restic path
- [ ] Cloudflare : zone `gabin-simond.fr` avec API token DNS:Edit
- [ ] Tailscale : compte actif avec tailnet
- [ ] GitHub : repos `homelab-config` et `homelab-doc`

---

## Scenario 1 : penny mort, galahad + lancelot OK

**Duree estimee** : 1-2h.

### Etapes

1. **Acheter un nouveau Raspberry Pi 4** (carte SD 64 Go + alim + SSD USB)
2. **Flash DietPi** sur la SD card depuis un autre appareil
3. **Premier boot** : se connecter en console locale avec le mot de passe default DietPi
4. **Changer password root immediatement** puis installer cle SSH
5. **Cloner le repo `homelab-config`** :
   ```bash
   git clone https://github.com/GabinSMD/homelab-config.git /mnt/ssd/config
   ```
6. **Restaurer les fichiers systeme** depuis le repo :
   ```bash
   cp /mnt/ssd/config/boot/config.txt /boot/firmware/
   cp /mnt/ssd/config/system/fstab /etc/
   cp /mnt/ssd/config/system/sshd_config /etc/ssh/
   cp /mnt/ssd/config/system/99-hardening.conf /etc/sysctl.d/
   cp /mnt/ssd/config/system/iptables.rules /etc/
   cp /mnt/ssd/config/system/watchdog.conf /etc/
   # ... etc
   ```
7. **Installer Docker, watchdog, fail2ban, unattended-upgrades, rclone, restic**
8. **Restaurer `.env`** depuis la cle USB
9. **Restaurer `.restic-env`** et tester : `restic snapshots`
10. **Restaurer les volumes Docker depuis restic** :
    ```bash
    restic restore latest --target /tmp/restore
    # Copier dans les volumes Docker
    ```
11. **Installer Tailscale** et rejoindre le tailnet (re-auth dans UI admin)
12. **Lancer Docker Compose** : `docker compose -p config -f docker/docker-compose.yml up -d`
13. **Verifier DNS primaire OK** depuis le LAN
14. **Tester les services** : vault, auth, home

---

## Scenario 2 : Cluster Proxmox detruit (galahad + lancelot)

**Duree estimee** : 2-3h.

### Etapes

1. **Reinstaller Proxmox VE** sur les deux ZimaBoards (USB installer)
2. **Applique `proxmox-post-install.sh`** depuis `homelab-config/scripts/`
3. **Recreer le cluster** :
   ```bash
   # Sur galahad
   pvecm create homelab
   # Sur lancelot
   pvecm add <galahad-ip>
   ```
4. **Recreer le LXC guardian (100)** :
   - Template Debian 12 standard
   - IP `192.168.1.30/24`, gw `192.168.1.254`
   - Installer AdGuard Home, Tailscale, ssh key
5. **Restaurer la config AdGuard secondaire** depuis git
6. **Deployer le script `rpi_watchdog.sh`** sur guardian
7. **Verifier health check externe fonctionne**

---

## Scenario 3 : Tout detruit (penny + galahad + lancelot)

**Duree estimee** : 4h + delai achat materiel.

### Ordre

1. Ordre des restaurations : **penny d'abord** (DNS/proxy), puis Proxmox cluster
2. Pas besoin de reinstaller dans l'ordre — pendant que Proxmox re-installe, penny peut deja tourner
3. La partie critique c'est Vaultwarden (dependance circulaire avec Authelia)

### Dependance circulaire Vaultwarden ↔ Authelia

**Probleme** : Authelia est derriere Traefik. Pour configurer Traefik il faut l'auth tokens Cloudflare. Ces tokens sont dans Vaultwarden.

**Solution** :
- Vaultwarden master password permet un acces direct depuis n'importe quel client Bitwarden
- Les tokens critiques (CF_DNS_API_TOKEN, TS_AUTHKEY, restic password) sont aussi sur la cle USB hors-ligne (backup redondant)

### Sequence de reconstruction totale

```
T+0    : achat materiel, clone repos
T+1h   : penny installe, Tailscale UP
T+1.5h : Docker Compose UP (sans data, containers vides)
T+2h   : restic restore → volumes Docker repeuples
T+2.5h : services verifies (vault, auth, home, monitor)
T+3h   : Proxmox install sur galahad
T+3.5h : cluster recree avec lancelot
T+4h   : LXC guardian recree, DNS secondaire UP
```

---

## Contacts critiques

| Provider | Raison | Contact |
|---|---|---|
| FAI (Free) | Panne Internet | 3244 |
| Backblaze B2 | Acces backups | help@backblaze.com |
| Cloudflare | Zone DNS bloquee | dashboard support |
| Tailscale | Tailnet issue | support@tailscale.com |
| YubiKey (Yubico) | Cle defaillante | support.yubico.com |

---

## Tests de la procedure

La procedure doit etre testee **au moins une fois par an** sur un environnement jetable.

| Date | Scenario | Duree reelle | Problemes rencontres |
|---|---|---|---|
| 2026-04-13 | DR drill Vaultwarden | 7s | Aucun |
| — | Reconstruction complete penny | — | A faire |
| — | Reconstruction cluster | — | A faire |

**Nouveau test = nouveau apprentissage**. Documenter chaque obstacle dans le tableau.
