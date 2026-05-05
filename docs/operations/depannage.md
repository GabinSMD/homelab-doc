# Maintenance et dépannage

Procedures de maintenance courante et resolution des problèmes rencontres.

---

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

!!! tip "Watchtower surveillé les mises a jour"
    Watchtower auto-update les services non-critiques et notifie via ntfy quand une mise a jour est disponible pour les services critiques (monitor-only).

### Firmware RPi

```bash
rpi-eeprom-update      # Verifie les mises a jour firmware
rpi-update             # Met a jour le firmware (attention, peut casser)
```

!!! danger "Attention"
    `rpi-update` installe le firmware bleeding-edge. Preferer `apt upgrade` pour les mises a jour stables du kernel.

---

## Vérification post-reboot

Checklist après un reboot :

- [ ] SSD monte sur `/mnt/ssd` en rw
- [ ] `pcie_aspm=off` actif (`cat /sys/module/pcie_aspm/parameters/policy` → `[off]`)
- [ ] USB autosuspend a -1 (`cat /sys/bus/usb/devices/*/power/autosuspend`)
- [ ] Quirks USB appliques (`dmesg | grep "Quirks match"`)
- [ ] Tous les containers Docker up (`docker ps`)
- [ ] Pas de throttling (`vcgencmd get_throttled` = `0x0`)
- [ ] Temperature normale (`vcgencmd measure_temp` < 70°C)

---

## SSD Argon Forty — deconnexions USB

### Symptomes

- `EXT4-fs (sdX): shut down requested (2)` dans dmesg
- `usb 2-2: USB disconnect` suivi de re-enumeration
- `device offline error, dev sdX`
- Services Docker inaccessibles (Docker root sur le SSD)
- Le device change de nom (`sda` → `sdb` → `sdc`) après chaque reconnexion

### Cause racine

Le bridge USB-SATA **ASMedia ASM1156** (Argon Forty) est sensible a :

1. **PCIe ASPM** — le mode `powersave` fait tomber le lien PCIe du controleur VL805 USB
2. **Connecteur USB interne** — le dongle entre le socle SSD et le board RPi peut avoir un mauvais contact
3. **Port USB 3.0** — `"Cannot enable. Maybe the USB cable is bad?"` → fallback USB 2.0

### Fixes appliques

Dans `/boot/firmware/cmdline.txt` :

```text
pcie_aspm=off usbcore.autosuspend=-1 usb-storage.quirks=174c:1156:u
```

| Paramètre | Effet |
|---|---|
| `pcie_aspm=off` | Désactivé le power management PCIe (fix principal) |
| `usbcore.autosuspend=-1` | Désactivé l'USB autosuspend |
| `usb-storage.quirks=174c:1156:u` | Force `usb-storage` au lieu de UAS pour le bridge ASMedia |

### Procedure de recovery manuelle

```bash
# 1. Verifier l'etat
dmesg | tail -20
lsblk
mount | grep ssd

# 2. Stopper Docker
systemctl stop docker docker.socket

# 3. Demonter le mount mort
umount -l /mnt/ssd

# 4. Verifier le filesystem
fsck.ext4 -y /dev/sdXX   # adapter au device actuel (lsblk)

# 5. Remonter
mount /mnt/ssd

# 6. Relancer Docker
systemctl start docker
```

### Auto-recovery (homelab_monitor.sh)

Le script `homelab_monitor.sh` intégré une **recovery automatique** en cas de deconnexion SSD :

1. **Stop Docker** en premier (libere les file handles sur le SSD)
2. **Double unmount** (`umount -f` + `umount -l`) pour nettoyer les mounts stale
3. Attend que le device reapparaisse **par UUID** jusqu'a 60s + 3s de stabilisation
4. `fsck.ext4 -y` sur le **nouveau** device (pas l'ancien)
5. Vérifie le code retour fsck (abort si >= 4)
6. Remonte `/mnt/ssd` via fstab (UUID)
7. Redémarre Docker, attend 10s pour les containers
8. Notification ntfy "SSD RECOVERED" ou "RECOVERY FAILED"

!!! info "Changement de device name (sda → sdb)"
    Le bridge ASMedia re-enumere le SSD avec un nouveau nom après chaque deconnexion (`sda` → `sdb` → `sdc`). La recovery utilisé l'UUID (pas le nom de device) pour retrouver le SSD quel que soit son nouveau nom. Le fstab utilisé aussi l'UUID.

**Rate limit** : max 3 tentatives par heure. Si les 3 echouent, alerte "SSD Recovery EPUISE — intervention manuelle requise."

### Investigation historique

Le support Argon a recommandé :

1. ~~Tester avec un cable USB 3.0 A-A court au lieu du dongle intégré~~ **Teste** — même problème de deconnexion qu'avec le dongle
2. Tester avec un SSD différent (fanxiang S201 128 Go commande)
3. ~~Vérifier les logs pour ecarter un problème logiciel~~ **Elimine** — aucun processus particulier au moment du disconnect

**Conclusion provisoire** : le bridge ASMedia ASM1156 est la cause, ni le cable ni le dongle. Le SSD de remplacement sera le test definitif.

Données SMART : `UDMA_CRC_Error_Count = 4` (erreurs de communication SATA), pas de secteurs realloues.

---

## Proxmox VE 9 — installation sur eMMC

### Symptome

L'installeur Proxmox ne propose pas le device eMMC (`mmcblk0`) comme cible d'installation.

### Cause

Proxmox ne supporte pas les devices `mmcblk` dans sa logique de partitionnement.

### Workaround

Patcher l'installeur avant de lancer l'installation. Voir le [guide complet](../guides/proxmox-zimaboard.md).

---

## Proxmox VE 9 — repos et popup

### "No valid subscription"

Popup a chaque connexion a l'interface web.

**Fix** : le script `proxmox-post-install.sh` patche le fichier JS de l'interface web et redémarre `pveproxy`.

### "Some suites are misconfigured"

Les fichiers `.sources` enterprise sont encore presents.

**Fix** : le script supprime les fichiers `/etc/apt/sources.list.d/pve-enterprise.sources` et `ceph.sources`.

### "Warning: old suite bookworm"

Un fichier `.list` legacy avec la suite `bookworm` au lieu de `trixie`.

**Fix** : le script supprime `/etc/apt/sources.list.d/pve-no-subscription.list` (ancien format).

---

## Docker containers — DNS interne et OIDC

### Symptome

Les containers ne peuvent pas résoudre `*.home.gabin-simond.fr` (ex: `auth.home.gabin-simond.fr`).
Erreur typique : `dial tcp: lookup auth.home.gabin-simond.fr on 127.0.0.11:53: no such host`

### Cause

Les containers sur le réseau Docker `proxy` utilisent le DNS Docker interne (`127.0.0.11`) qui ne connait pas les rewrites AdGuard.

### Fix

Ajouter `dns: 192.168.1.28` dans le `docker-compose.yml` pour chaque container qui a besoin de résoudre des domaines locaux (Portainer, Beszel, Homepage, Vaultwarden).

```yaml
services:
  mon-service:
    dns:
      - 192.168.1.28
```

---

## Beszel — OIDC "Only superusers can perform this action"

### Symptome

Login OIDC via Authelia renvoie `403 — Only superusers can perform this action`.

### Cause

PocketBase (backend de Beszel) bloque la création de comptes via OAuth2 par defaut.

### Workaround

1. Aller dans `/_/#/settings` → désactiver la restriction admin-only création
2. Editer la collection `users` → API Rules → changer le "Create rule" en : `@request.context = "oauth2"`
3. Reactiver la restriction admin-only
4. Se connecter via OIDC (le compte est créé avec le rôle `user`)
5. Aller dans `/_/#/collections` → `users` → promouvoir le compte en `admin`

Source : [henrygd/beszel#291](https://github.com/henrygd/beszel/issues/291)

---

## Authelia — redirect_uri mismatch

### Symptome

Erreur `invalid_request` : `The 'redirect_uri' parameter does not match any of the OAuth 2.0 Client's pre-registered 'redirect_uris'.`

### Cause

L'URI de callback du service ne correspond pas exactement a ce qui est configuré dans Authelia. Attention aux :

- Trailing slash (`/` vs pas de `/`)
- Chemins spécifiques (`/api/oauth2-redirect`, `/identity/connect/oidc-signin`)

### Diagnostic

```bash
docker logs authelia | grep "redirect_uri"
```

Le log indique l'URI attendue par le client → copier cette URI exacte dans la config Authelia.

### URIs correctes par service

| Service | redirect_uri |
|---|---|
| Proxmox | `https://galahad.home.gabin-simond.fr` (et lancelot) |
| Portainer | `https://portainer.home.gabin-simond.fr/` (avec slash) |
| Beszel | `https://monitor.home.gabin-simond.fr/api/oauth2-redirect` |

---

## Services inaccessibles via Tailscale VPN

### Symptome

Certains services (ex: `auth.home.gabin-simond.fr`, `vault.home.gabin-simond.fr`) ne chargent pas depuis un client Tailscale, alors qu'ils fonctionnent en local.

### Cause

Des **DNS Rewrites statiques** dans AdGuard (Filters > DNS Rewrites) ecrasent les `user_rules` conditionnelles. Les rewrites statiques sont appliquees en premier et renvoient toujours l'IP LAN (`192.168.1.28`), même aux clients Tailscale qui ont besoin de l'IP Tailscale (`100.97.239.90`).

### Fix

Supprimer toutes les entrees dans **Filters > DNS Rewrites** pour les domaines `*.home.gabin-simond.fr`. Le wildcard dans `user_rules` géré déjà tous les sous-domaines avec le bon routage conditionnel (LAN vs Tailscale).

Voir [Comment fonctionne le DNS](../architecture/reseau.md#les-dns-rewrites-la-piece-cle) pour le détail des règles.

---

## Beszel — OIDC "Failed to fetch OAuth2 token"

### Symptome

Login Authelia fonctionne (popup s'ouvre, auth OK) mais retour sur Beszel = page blanche. Console : `ClientResponseError 401`.

### Causes (3 root causes combinees)

**1. DNS Docker → NXDOMAIN pour `auth.home.gabin-simond.fr`**

Le wildcard AdGuard `||home.gabin-simond.fr^$dnsrewrite=...,client=192.168.1.0/24` ne matche PAS les containers Docker (`172.20.0.x`). PocketBase ne peut pas résoudre `auth.home...` → token exchange échoué silencieusement.

Fix : ajouter un rewrite spécifique (non filtre par client) dans AdGuard :
```yaml
rewrites:
  - domain: auth.home.gabin-simond.fr
    answer: 192.168.1.28
    enabled: true
```

**2. Image scratch Beszel = pas de CA certificates**

Go HTTP client ne peut pas vérifier le cert Let's Encrypt → TLS handshake échoué silencieusement.

Fix dans `docker-compose.yml` :
```yaml
beszel:
  volumes:
    - /etc/ssl/certs/ca-certificates.crt:/etc/ssl/certs/ca-certificates.crt:ro
  environment:
    SSL_CERT_FILE: /etc/ssl/certs/ca-certificates.crt
```

**3. Subject ID mismatch dans PocketBase**

Si les sessions OIDC Authelia sont purgees, le subject ID change. La table `_externalAuths` dans PocketBase garde l'ancien ID → mismatch → 401 après token exchange réussi.

```bash
# Trouver le nouveau subject dans les logs Authelia (debug) :
docker logs authelia | grep "beszel.*subject"
# Mettre a jour PocketBase :
sqlite3 /path/to/beszel/data.db \
  "UPDATE _externalAuths SET providerId='<new_subject>' WHERE provider='oidc';"
```

### Prevention

- Ne JAMAIS purger les sessions OIDC Authelia sans re-aligner les `_externalAuths`
- Garder les CA certs montes en permanence dans Beszel
- Tester l'OIDC après chaque rotation de secret

---

## Beszel — hostname ancien affiche (pve1, gabin-simond.home)

### Cause

Le beszel-agent cache le hostname au démarrage. Si le hostname système a été renomme APRÈS le démarrage de l'agent, l'ancien nom persiste dans `system_details`.

### Fix

```bash
# 1. Restart les agents sur chaque host
ssh galahad "sudo systemctl restart beszel-agent"
ssh lancelot "sudo systemctl restart beszel-agent"
docker restart beszel-agent  # penny

# 2. Si le hostname persiste, forcer en DB :
sqlite3 /path/to/beszel/data.db "UPDATE system_details SET hostname='galahad' WHERE hostname='pve1';"
```

---

## Portainer — mot de passe perdu

### Procedure de reset

```bash
# Trouver le bon volume
docker inspect portainer --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'

# Reset avec le helper (adapter le nom du volume)
docker compose stop portainer
docker run --rm -v config_portainer-data:/data portainer/helper-reset-password
docker compose up -d portainer
```

Le helper généré un nouveau mot de passe aleatoire.

---

## Portainer — "failed opening store : timeout"

### Cause

Un process Portainer fantome tient le verrou BoltDB. Typiquement après un reset de mot de passe via `--admin-password` qui n'a pas été arrêté proprement.

### Fix

```bash
fuser /path/to/portainer-data/portainer.db  # trouver le PID
kill -9 <PID>
docker start portainer
```

---

## PVE — page blanche / chargement infini (Trixie)

### Symptome

L'interface web Proxmox VE (`galahad.home.*` / `lancelot.home.*`) affiche une page blanche ou tourne a l'infini.

### Causes possibles

**1. DNS pointe vers l'IP directe Proxmox au lieu de Traefik**

```bash
dig galahad.home.gabin-simond.fr @192.168.1.28
# Si renvoie 192.168.1.18 au lieu de 192.168.1.28 → le navigateur
# essaie :443 sur Proxmox (qui n'ecoute que sur :8006) → timeout
```

Fix : les rewrites AdGuard doivent pointer vers penny (192.168.1.28) pour que Traefik proxy vers `:8006`.

**2. Fichier ExtJS manquant (symlink `ext6-all.js`)**

Proxmox 9 sur Trixie : `libjs-extjs` installe `ext-all.js` mais `pve-manager` cherche `ext6-all.js`.

```bash
# Sur chaque node :
cd /usr/share/javascript/extjs/
ln -sf ext-all.js ext6-all.js
ln -sf ext-all-debug.js ext6-all-debug.js
```

**3. Security headers incompatibles (CSP, COOP)**

`Content-Security-Policy` ou `Cross-Origin-Opener-Policy: same-origin` appliques globalement cassent ExtJS + WebSocket. Les headers de sécurité ne doivent PAS être appliques aux routes PVE.

---

## Stack down après `docker compose down` + reboot

### Symptome

Après un reboot (ou un `docker compose down` suivi d'une session qui n'a pas pu `up`), **aucun container ne remonte** même si Docker tourne :

```bash
docker ps           # vide
docker ps -a        # tous Exited (0) il y a N heures
systemctl is-active docker  # active
```

### Cause racine

La restart policy du compose est `unless-stopped`. Docker **n'auto-redémarre pas** les containers arretes via `docker stop` ou `docker compose down` — même a travers un reboot daemon. Seuls les containers crashes (`restart: always`) ou arretes par panne remontent.

C'est voulu (sécurité contre boucle de redémarrage), mais ca veut dire qu'un `down` oublie = stack morte jusqu'au prochain `up`.

!!! tip "Auto-repair depuis 2026-04-19"
    `check_docker_autorepair` dans `homelab_monitor.sh` détecté stack vide + daemon actif et lance `docker compose up -d` après 2 min. Circuit breaker 3 tentatives / 24h : au 3e échec ntfy urgent "autorepair-capped" et stop. Reset : `rm /var/lib/homelab_monitor/autorepair-docker-attempts`.

### Fix

```bash
cd /mnt/ssd/config/docker && docker compose up -d
```

Attendre 15-30 s et vérifier healthchecks :

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

### Prevention

- Toujours terminer une session de maintenance par `docker compose up -d` avant de fermer le terminal.
- En cas de session interrompue (outil bash cassé, etc.), noter l'état avec `/checkpoint` pour que la session suivante sache qu'il faut redémarrer.
- Utiliser `homelab_monitor.sh` (hook systemd) pour alerter si `docker ps` renvoie vide après boot.

---

## CrowdSec — crash-loop "read-only file system" sur local_api_credentials.yaml

### Symptome

```text
Error: failed copying from /tmp/tempXXXXX to /etc/crowdsec/local_api_credentials.yaml:
  open /etc/crowdsec/local_api_credentials.yaml: read-only file system
```

Container `crowdsec` en état `Restarting (1)` en boucle, même après nettoyage du volume `crowdsec-data`.

### Cause

L'entrypoint CrowdSec **reecrit `local_api_credentials.yaml` et `online_api_credentials.yaml` a chaque boot** (`config_set` sur machine id/URL), même quand la machine est déjà registered. Si le bind-mount est en `:ro`, le `mv /tmp/xxx → /etc/crowdsec/...` échoué.

Typique quand on activé le declassement sops→tmpfs et qu'on mount les credentials read-only par reflex sécurité.

### Fix

Monter les deux fichiers en `:rw` :

```yaml
volumes:
  - /run/homelab/crowdsec/online_api_credentials.yaml:/etc/crowdsec/online_api_credentials.yaml:rw
  - /run/homelab/crowdsec/local_api_credentials.yaml:/etc/crowdsec/local_api_credentials.yaml:rw
```

Puis :

```bash
cd /mnt/ssd/config/docker && docker compose up -d crowdsec
```

### Pourquoi c'est safe

- **Chiffrement at-rest** : les fichiers sont stockes chiffres (sops) dans le repo config. Le `.yaml` en clair ne vit qu'en RAM sur `/run/homelab/` (tmpfs).
- **Tmpfs runtime** : pas de persistance sur disque, efface au shutdown.
- **Scope limité** : seul le container crowdsec peut ecrire sur son propre bind-mount, pas d'escalade.

Les fichiers sops contiennent l'ID machine + une URL — sensibles mais pas aussi critiques qu'une clé privee. L'interet du sops-declassement reste : **pas de secret en clair dans git**.

### Diagnostic

```bash
docker logs --tail 20 crowdsec              # voir la boucle d'erreur
docker inspect crowdsec --format '{{json .Mounts}}' | python3 -m json.tool
# Verifier que les deux mounts credentials sont "RW": true
ls -la /run/homelab/crowdsec/               # confirmer que les fichiers sont decryptes
```

---

## Docker daemon crash loop (SIGBUS journald)

### Symptome

`systemctl show docker --property=NRestarts` > 3 dans la journee, containers exit 0 massivement en cascade, auto-repair plafonne :

```text
dockerd[PID]: SIGBUS: bus error
dockerd[PID]: github.com/moby/moby/v2/daemon/logger/journald/internal/sdjournal._Cfunc_sd_journal_next
```

### Cause racine

Bug ARM-specific du log-driver `journald` de dockerd. Le reader sdjournal (cgo binding) fait un SIGBUS quand journald rotate les files pendant un read mmap. Typique sur Pi avec SystemMaxUse agressif.

`journalctl --verify` passe (pas corruption journal) — c'est le reader qui panique.

### Fix

`/etc/docker/daemon.json` :

```json
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    }
}
```

Puis `systemctl restart docker && docker compose up -d`.

### Impact

- Les logs containers ne sont plus dans `journalctl` (ni `journalctl CONTAINER_NAME=X`).
- `docker logs X --tail N` continue de fonctionner (lit json-file direct).
- Alloy/Promtail pour shipping : doit lire `/var/lib/docker/containers/*/*-json.log` au lieu de journald.
- Historique pre-switch perdu (Loki l'a déjà ingere si actif).

---

## pmxcfs stuck read-only après recovery node cluster

### Symptome

Sur un cluster 2-node, après qu'un node tombe puis revient, `corosync-quorumtool -s` montre `Quorate: Yes` mais :

```bash
sudo pvecm status           # ipcc_send_rec[1] failed: Unknown error -1
sudo pct config 103         # meme erreur
sudo touch /etc/pve/.x      # Read-only file system
```

### Cause racine

pmxcfs (fuse mount de `/etc/pve`) est démarre AVANT que corosync reforme le quorum, et ne retransitionne pas automatiquement vers RW une fois le quorum retrouve. État transitoire coince.

### Fix

```bash
sudo systemctl restart pve-cluster
sleep 3
sudo touch /etc/pve/.x && sudo rm /etc/pve/.x && echo OK
```

Zero impact sur les LXC running — `/etc/pve` n'est utilisé qu'a la reconfig, pas au runtime container.

### Prevention

Qdevice (3e vote) : le survivant ne perd jamais quorum → pmxcfs reste RW tout du long → pas de transition coincee. Voir `architecture/cluster.md`.

---

## /etc, /usr, /boot read-only via SSH sur nodes PVE

### Symptome

Sur galahad ou lancelot, via SSH :

```text
sudo apt install X          # "Read-only file system" sur /etc/*.dpkg-new
sudo pct set N --onboot 1   # idem sur /etc/pve/nodes/X/lxc/N.conf.tmp.PID
findmnt /etc                # /etc /dev/mapper/pve-root[/etc] ext4 ro,relatime
```

Pas d'entree fstab, pas de mount-unit systemd.

### Cause racine

Services systemd actifs avec `ProtectSystem=strict` ou `full` **sans** `PrivateMounts=yes` : leur namespace mount est `shared` → leurs bind-mounts RO (via ProtectSystem) se propagent au namespace host global. Chaque restart accumule des leaks.

Scan pour identifier :

```bash
for svc in $(systemctl list-units --type=service --state=active --no-legend | awk '{print $1}'); do
  ps=$(systemctl show "$svc" -p ProtectSystem --value)
  pm=$(systemctl show "$svc" -p PrivateMounts --value)
  if [ "$ps" = "strict" ] || [ "$ps" = "full" ]; then
    [ "$pm" != "yes" ] && echo "LEAK: $svc"
  fi
done
```

### Fix

1. Drop-in `PrivateMounts=yes` sur chaque service listed :

```bash
mkdir -p /etc/systemd/system/<svc>.service.d
cat > /etc/systemd/system/<svc>.service.d/private-mounts.conf <<EOF
[Service]
PrivateMounts=yes
EOF
systemctl daemon-reload
systemctl restart <svc>
```

2. Remount RW immédiate pour enlever les leaks déjà presents :

```bash
mount -o remount,rw /etc
mount -o remount,rw /usr
mount -o remount,rw /boot
```

Le restart `ssh.service` appliquant le drop-in risque de kill la session — scheduler via `systemd-run --on-active=30s systemctl restart ssh` pour préserver la connexion activé.

### Services concernes (2026-04-19)

beszel-agent, chrony, fail2ban, postfix, ssh, systemd-logind. Tous fixes via drop-ins `/etc/systemd/system/<svc>.service.d/private-mounts.conf`.

---

## Commandes utiles

### Containers et services

```bash
docker ps -a                              # Etat de tous les conteneurs
docker logs <container_name> --tail 50    # Derniers logs
docker compose up -d <service_name>       # Relancer un service specifique
docker system df                          # Espace utilise par Docker
docker system prune -f                    # Nettoyer images/volumes inutilises
```

### Temperature et alimentation

```bash
vcgencmd measure_temp                     # Temperature actuelle
vcgencmd get_throttled                    # 0x0 = tout va bien
```

| Valeur throttled | Signification |
|---|---|
| `0x0` | OK |
| `0x50000` | Throttling dans le passe |
| `0x50005` | Throttling actif + sous-voltage |

### Espace disque

```bash
df -h                    # Vue d'ensemble
docker system df         # Espace utilise par Docker
docker system prune -f   # Nettoyer images/volumes inutilises
```
