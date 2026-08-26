# Maintenance et dépannage

Procédures de maintenance courante et resolution des problèmes rencontres.

---

## Mises a jour

### DietPi

```bash
# NE PAS lancer directement — voir l'avertissement ci-dessous
systemd-run --unit=dietpi-maj --collect \
  --setenv=DEBIAN_FRONTEND=noninteractive \
  --setenv=APT_LISTBUGS_FRONTEND=none \
  /boot/dietpi/dietpi-update 1
journalctl -u dietpi-maj -f     # suivre
```

:::danger[`dietpi-update` lance un `apt upgrade` COMPLET et peut tuer sa propre session]
Vécu le 2026-08-20 en montant de v10.2.3 à v10.6.2.

**Deux surprises qui se combinent.** D'abord, la phase de patch de
`dietpi-update` lance un `apt upgrade` sur **tous** les dépôts, y compris les
dépôts tiers — ici 254 Mo : `docker-ce`, `containerd.io`, `alloy`, `trivy`,
`tailscale`. Le réglage `CONFIG_CHECK_APT_UPDATES` **ne protège pas** de ça :
il ne gouverne que la branche « aucune mise à jour DietPi disponible ».

Ensuite, le `postinst` de `tailscale` redémarre `tailscaled`. Comme l'accès à
penny passe uniquement par Tailscale, la session tombe et emporte
`dietpi-update` par SIGHUP — **en pleine phase `Setting up`**.

D'où le `systemd-run` ci-dessus : il place la mise à jour hors du cgroup de
la session, qui peut alors mourir sans rien interrompre.
:::

:::warning[Un système peut tourner parfaitement avec un dpkg incohérent]
Après l'interruption : `docker --version` annonçait la nouvelle version, les
22 conteneurs tournaient, `systemctl --failed` était vide. Et pourtant
`docker-ce` et `trivy` étaient en `iU` (dépaquetés, `postinst` jamais joué) et
`tailscale` en `iF`. Les binaires sont en place, ce sont les scripts de
configuration qui manquent.

**Aucun contrôle habituel ne voit ça.** Le seul qui le détecte :

```bash
dpkg -l | awk '$1 !~ /^(ii|hi|rc)/ && NR>5 {print $1, $2}'
```

`hi` = held (normal pour `rpi-eeprom`), `rc` = désinstallé avec configs
résiduelles (normal aussi — ne pas le compter comme une anomalie).

**Reprise**, toujours détachée :

```bash
systemd-run --unit=reprise --collect bash -c \
  'dpkg --configure -a && apt-get -f install -y && /boot/dietpi/dietpi-update 1'
```
:::

:::warning[L'autopurge supprime le noyau de repli]
`dietpi-update` a purgé `linux-image-6.12.75` et son initrd, ne laissant
qu'un seul noyau installé. Sur une machine au matériel marginal, c'est un
filet en moins. Vérifier après coup, et réinstaller au besoin :

```bash
ls -d /usr/lib/modules/*/                     # doit en lister au moins deux
apt-get install --no-install-recommends linux-image-<version>+rpt-rpi-v8
```

Réinstaller un **ancien** noyau ne touche pas au démarrage : le hook
`/etc/kernel/postinst.d/z50-raspi-firmware` ne recopie vers
`/boot/firmware/kernel8.img` que si le noyau configuré est le plus récent de
`/boot`. Le vérifier quand même par le hash :

```bash
sha1sum /boot/firmware/kernel8.img /boot/vmlinuz-*
```
:::

#### Basculer sur le noyau de repli

```bash
cp /boot/vmlinuz-6.12.75+rpt-rpi-v8 /boot/firmware/kernel8.img && sync
systemctl reboot
```

Pour revenir, même commande avec le noyau voulu. `/sbin/shutdown` échoue en
« Failed to connect to bus » sur cette machine : utiliser `systemctl reboot`.

### Docker images

```bash
cd /mnt/ssd/config
docker compose pull    # Telecharge les nouvelles images
docker compose up -d   # Redeploy avec les nouvelles images
docker image prune -f  # Supprime les anciennes images
```

:::warning[Les images sont épinglées : `pull` seul ne met rien à jour]
Depuis le retrait de Watchtower (2026-07-06), plus aucune mise à jour n'est
automatique et chaque image est épinglée par `@sha256` dans le compose. Un
`docker compose pull` ne ramène donc **pas** une nouvelle version : il
retélécharge le digest déjà épinglé. Pour mettre à jour, il faut changer le
`@sha256` dans `docker-compose.yml`, puis `pull` et `up -d`. Le timer mensuel
`digest-drift-check` signale quand l'amont a bougé.
:::

:::danger[`up -d` déploie l'état du fichier, pas l'état du dernier commit]
Vérifiez `git status` avant : des modifications de `docker-compose.yml` non
commitées partiraient en production avec cette commande.
:::

### Firmware RPi

```bash
rpi-eeprom-update      # Verifie les mises a jour firmware
rpi-update             # Met a jour le firmware (attention, peut casser)
```

:::danger[Attention]
`rpi-update` installe le firmware bleeding-edge. Préférer `apt upgrade` pour les mises a jour stables du kernel.
:::

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

## SSD Argon Forty — déconnexions USB

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

### Procédure de recovery manuelle

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

Le script `homelab_monitor.sh` intégré une **recovery automatique** en cas de déconnexion SSD :

1. **Stop Docker** en premier (libéré les file handles sur le SSD)
2. **Double unmount** (`umount -f` + `umount -l`) pour nettoyer les mounts stale
3. Attend que le device reapparaisse **par UUID** jusqu'a 60s + 3s de stabilisation
4. `fsck.ext4 -y` sur le **nouveau** device (pas l'ancien)
5. Vérifie le code retour fsck (abort si >= 4)
6. Remonte `/mnt/ssd` via fstab (UUID)
7. Redémarre Docker, attend 10s pour les containers
8. Notification ntfy "SSD RECOVERED" ou "RECOVERY FAILED"

:::info[Changement de device name (sda → sdb)]
Le bridge ASMedia re-enumere le SSD avec un nouveau nom après chaque déconnexion (`sda` → `sdb` → `sdc`). La recovery utilisé l'UUID (pas le nom de device) pour retrouver le SSD quel que soit son nouveau nom. Le fstab utilisé aussi l'UUID.
:::

**Rate limit** : max 3 tentatives par heure. Si les 3 echouent, alerte "SSD Recovery EPUISE — intervention manuelle requise."

### Investigation historique

Le support Argon a recommandé :

1. ~~Tester avec un cable USB 3.0 A-A court au lieu du dongle intégré~~ **Teste** — même problème de déconnexion qu'avec le dongle
2. Tester avec un SSD différent (fanxiang S201 128 Go commande)
3. ~~Vérifier les logs pour ecarter un problème logiciel~~ **Éliminé** — aucun processus particulier au moment du disconnect

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

Les fichiers `.sources` enterprise sont encore présents.

**Fix** : le script supprimé les fichiers `/etc/apt/sources.list.d/pve-enterprise.sources` et `ceph.sources`.

### "Warning: old suite bookworm"

Un fichier `.list` legacy avec la suite `bookworm` au lieu de `trixie`.

**Fix** : le script supprimé `/etc/apt/sources.list.d/pve-no-subscription.list` (ancien format).

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

Le log indiqué l'URI attendue par le client → copier cette URI exacte dans la config Authelia.

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

## Tailscale SSH — atterrissage dans le container Alpine au lieu du RPi

### Symptôme

En se connectant via `ssh root@homelab` (port 22), le shell affiche :

- Motd Alpine Linux (`setup-alpine`, `wiki.alpinelinux.org`)
- Shell `ash` au lieu de `bash`
- Historique `.ash_history` dans `/root`
- Utilisateur = identité Tailscale (ex: `gabin-simond`) et non `root`
- Aucune trace de DietPi, Docker ou des services du homelab

### Cause

L'image Docker `tailscale/tailscale` est basée sur **Alpine Linux**. Quand Tailscale SSH est géré par le container (et non par le daemon host), la connexion `ssh root@homelab` atterrit dans le container Alpine — pas sur le RPi.

Le container Tailscale intercepte la connexion sur le port 22 Tailscale et mappe l'identité Tailscale à un utilisateur local du container.

### Fix — contourner le container via OpenSSH

Utiliser l'**IP Tailscale du RPi avec le port SSH custom** (OpenSSH du host, pas Tailscale SSH) :

```bash
ssh -p 2806 root@100.97.239.90
```

Dans Termius, modifier le host :

| Champ | Valeur incorrecte | Valeur correcte |
|---|---|---|
| IP or Hostname | `homelab` | `100.97.239.90` |
| Port | 22 (Default) | `2806` |
| Username | root | `root` |
| Auth | — | Clé SSH |

Cette connexion va directement sur **OpenSSH de DietPi** via le tunnel WireGuard Tailscale, sans passer par le container.

---

## Tailscale SSH — shell minimaliste à la connexion

### Symptôme

En se connectant via `ssh root@homelab` (Tailscale SSH), le shell est différent de celui obtenu via OpenSSH (`ssh -p 2806 root@192.168.1.28`) :

- Pas de bannière DietPi
- `PATH` incomplet (commandes introuvables)
- Prompt basique sans couleurs
- Variables d'environnement manquantes (`LANG`, `TERM`, etc.)

### Cause

**Tailscale SSH est une implémentation SSH distincte d'OpenSSH.** Il n'utilise pas `/etc/ssh/sshd_config` et n'invoque pas le shell comme un *login shell*. Concrètement :

| Mécanisme | OpenSSH (port 2806) | Tailscale SSH |
|---|---|---|
| `/etc/profile` | Chargé (login shell) | **Non chargé** |
| `~/.bash_profile` | Chargé | **Non chargé** |
| PAM / pam_exec | Actif (DietPi banner) | **Non actif** |
| `/etc/ssh/sshrc` | Exécuté | **Non exécuté** |
| Mode `check` (MFA) | Non | Validation navigateur |

Le shell démarre donc en mode non-interactif minimal, sans l'environnement habituel de DietPi.

### Fix — forcer un login shell

**Option 1 : Termius (mobile)**

Dans les paramètres du host Termius :

1. Tap **Startup Snippet** → créer un nouveau snippet
2. Contenu du snippet : `. /etc/profile; . ~/.bashrc`
3. Sélectionner ce snippet dans les paramètres du host → sauvegarder

C'est la méthode recommandée depuis mobile — aucune commande à retenir, actif à chaque connexion.

:::warning[Ne pas utiliser `exec bash -l`]
`exec` remplace le shell courant par le nouveau processus. Quand `bash -l` termine son initialisation sans commande interactive, la session se ferme immédiatement. Sourcer les fichiers directement (`. /etc/profile`) charge l'environnement sans remplacer le shell.
:::

**Option 2 : à la connexion (terminal classique)**

```bash
ssh root@homelab -t 'bash -l'
```

Le flag `-t` force un pseudo-TTY et `-l` invoque bash comme login shell — identique à une connexion OpenSSH classique.

**Option 3 : alias permanent (côté client desktop)**

Dans `~/.ssh/config` sur la machine cliente :

```text
Host homelab
    RequestTTY yes
    RemoteCommand bash -l
```

### Vérification

Après correction, les deux méthodes doivent donner le même résultat :

```bash
ssh root@homelab "echo \$SHELL; echo \$PATH"
ssh -p 2806 root@192.168.1.28 "echo \$SHELL; echo \$PATH"
```

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

### Procédure de reset

```bash
# Trouver le bon volume
docker inspect portainer --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'

# Reset avec le helper (adapter le nom du volume)
docker compose stop portainer
docker run --rm -v config_portainer-data:/data portainer/helper-reset-password
docker compose up -d portainer
```

Le helper généré un nouveau mot de passe aléatoire.

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

:::tip[Auto-repair depuis 2026-04-19]
`check_docker_autorepair` dans `homelab_monitor.sh` détecté stack vide + daemon actif et lance `docker compose up -d` après 2 min. Circuit breaker 3 tentatives / 24h : au 3e échec ntfy urgent "autorepair-capped" et stop. Reset : `rm /var/lib/homelab_monitor/autorepair-docker-attempts`.
:::

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

- **Chiffrement at-rest** : les fichiers sont stockes chiffrés (sops) dans le repo config. Le `.yaml` en clair ne vit qu'en RAM sur `/run/homelab/` (tmpfs).
- **Tmpfs runtime** : pas de persistance sur disque, efface au shutdown.
- **Scope limité** : seul le container crowdsec peut ecrire sur son propre bind-mount, pas d'escalade.

Les fichiers sops contiennent l'ID machine + une URL — sensibles mais pas aussi critiques qu'une clé privee. L'intérêt du sops-declassement reste : **pas de secret en clair dans git**.

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

## Alloy crashe a chaque :17 (SIGBUS journald, RAMlog DietPi)

### Symptome

`alloy.service` sur penny crashe a chaque XX:17 (NRestarts grimpe en continu). systemd le relance (`Restart=always`) donc le service parait "actif", mais : trous horaires dans les metriques/logs, et le journal persistant ne retient qu'~1h.

```text
alloy[PID]: SIGBUS: bus error
alloy[PID]: go-systemd/v22/sdjournal._Cfunc_my_sd_journal_next
alloy[PID]: loki/source/journal.newTailerWithReader
alloy.service: Failed with result 'exit-code'.
```

Indice cle : `journalctl --header` montre une **first-entry = derniere :17** (le journal est reinitialise chaque heure). Le `journalctl -u alloy --since` peut afficher "1 crash" trompeur car la preuve elle-meme se fait vacuumer.

### Cause racine

DietPi RAMlog (mode -1) lance `dietpi-logclear` via `cron.hourly` (`/etc/crontab`, tick a :17) qui fait `find /var/log -type f | truncate -cs0`. Ce `find` **descend dans le mount persistant `/var/log/journal`** (SSD) et tronque le `system.journal` ACTIF a 0 octet. Le fichier etant mmap'd par `loki.source.journal` d'Alloy (`sd_journal_next` via cgo/libsystemd), la troncature invalide les pages mappees → SIGBUS.

A ne pas confondre avec le SIGBUS *dockerd* ci-dessus (log-driver journald) : ici c'est le *reader* Alloy + une troncature *externe* par DietPi, pas une rotation interne.

### Fix

1. Journal en RAM, hors perimetre de `dietpi-logclear` — `/etc/systemd/journald.conf.d/10-sucre-alloy-sigbus-volatile.conf` :

   ```ini
   [Journal]
   Storage=volatile
   ```

2. Pin Alloy sur la RAM (sinon il mappe encore les fichiers residuels `/var/log/journal`) — dans `loki.source.journal "system"` de `config.alloy` :

   ```alloy
   path = "/run/log/journal"
   ```

3. `systemctl restart systemd-journald && systemctl restart alloy.service`

**Verification (sans attendre :17)** : relancer `/boot/dietpi/func/dietpi-logclear 1` a la main → `systemctl show alloy -p MainPID` doit etre **inchange** et `NRestarts` rester stable (avant le fix : crash systematique au meme test).

### Impact

- Plus de journal local persistant apres reboot (l'historique central reste dans Loki). Aligne avec la philosophie RAMlog de DietPi.
- Fichiers `/var/log/journal/*` desormais vestigiaux (tronques sans effet, nettoyables).
- **Lecon** : sur DietPi RAMlog, ne jamais poser le journald persistant sous `/var/log/journal`. Voir `projet/decisions.md` → "Journald penny : volatile".

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

2. Remount RW immédiate pour enlever les leaks déjà présents :

```bash
mount -o remount,rw /etc
mount -o remount,rw /usr
mount -o remount,rw /boot
```

Le restart `ssh.service` appliquant le drop-in risque de kill la session — scheduler via `systemd-run --on-active=30s systemctl restart ssh` pour préserver la connexion activé.

### Services concernes (2026-04-19)

beszel-agent, chrony, fail2ban, postfix, ssh, systemd-logind. Tous fixes via drop-ins `/etc/systemd/system/<svc>.service.d/private-mounts.conf`.

---

## Réseau Docker — ETIMEDOUT entre conteneurs du même réseau (règles nft orphelines)

### Symptôme

Un conteneur n'atteint pas un autre conteneur **du même réseau Docker**, alors que
la cible est déclarée `healthy` :

```
SequelizeConnectionError: connect ETIMEDOUT 172.20.0.4:5432
```

`ETIMEDOUT` et non `ECONNREFUSED` : les paquets sont **jetés en silence**, ce n'est
pas un service absent. Le conteneur boucle en redémarrage et `autoheal` tourne à
vide.

### Cause racine

Docker 28+ installe une protection anti-accès-direct sous forme de règles
**nftables natives** dans `table ip raw`, chaîne `PREROUTING`. Un
`docker network rm` **ne les nettoie pas**. Si un réseau est recréé sur le même
sous-réseau, il reçoit un nouveau bridge (`br-<id>`) tandis que les règles de
l'ancien subsistent :

```
iifname != "br-50afc5752635" ip daddr 172.20.0.4 counter packets 44 drop   # bridge DISPARU
iifname != "br-4c9e0a9dabb3" ip daddr 172.20.0.4 counter packets 0  drop   # bridge actuel
```

Tout trafic arrivant par le bridge actuel satisfait `!= ancien bridge`, donc il est
jeté. **Un compteur non nul sur une règle qui cite un bridge inexistant est la
preuve.**

:::danger[Rien de tout cela n'apparaît dans `iptables`]
Ces règles agissent **avant conntrack et avant la table filter**. Les
compteurs d'`iptables -L` restent à zéro et la politique `FORWARD` semble
saine. Dès qu'un blocage réseau ne s'explique par aucun compteur iptables,
passer à `nft list ruleset`.
:::

### Détection

```bash
# Tout bridge cité par nft mais absent du noyau est un fantôme
EXIST=$(ip -br link show type bridge | awk '{print $1}' | tr '\n' '|')
nft -a list ruleset | grep -oE 'br-[0-9a-f]{12}' | sort -u |
  while read b; do echo "$EXIST" | grep -q "$b" || echo "FANTOME: $b"; done
```

### Fix — les deux étages, sinon il revient

:::danger[Nettoyer le noyau ne suffit pas : les règles sont persistées]
Corrigé une première fois le 2026-08-16 par `nft delete rule`. **Le 2026-08-20,
au premier redémarrage, le même bridge fantôme et les mêmes six règles étaient
de retour.** Elles vivaient aussi dans `/etc/iptables/rules.v4`, que
`netfilter-persistent` réinjecte à chaque démarrage. Le correctif était en
sursis, et le sursis a duré jusqu'au reboot suivant — quatre jours.
:::

```bash
OLD=br-50afc5752635          # le bridge fantôme
cp -a /etc/iptables/rules.v4 /etc/iptables/rules.v4.bak-$(date +%Y%m%d)

# 1. noyau
for ip in 2 3 4 5 6 7; do
  iptables -t raw -D PREROUTING -d 172.20.0.$ip/32 ! -i $OLD -j DROP 2>/dev/null
done
iptables -t nat -D POSTROUTING -s 172.20.0.0/16 ! -o $OLD -j MASQUERADE 2>/dev/null

# 2. fichier persisté — l'étape oubliée
sed -i "/$OLD/d" /etc/iptables/rules.v4

# 3. vérifier les deux
iptables-save | grep -c "$OLD"                 # doit renvoyer 0
grep -c "$OLD" /etc/iptables/rules.v4          # doit renvoyer 0
```

Vérifier ensuite que le bridge **vivant** a bien gardé ses règles, puis relancer le
conteneur. Le retour à `healthy` prend une minute.

### Prévention

Après tout `docker network rm`, chercher les bridges fantômes — surtout si un réseau
est recréé sur le même sous-réseau. Et considérer que toute suppression de règle
netfilter se fait **aux deux étages**, noyau et fichier persisté :

```bash
grep <motif> /etc/iptables/rules.v4
```

:::note[Cause de fond]
`rules.v4` contient des règles **générées par Docker**, capturées par un
`netfilter-persistent save` à un instant donné. C'est fragile par
construction : Docker régénère ses règles à chaque démarrage du daemon et ne
connaît pas les bridges d'une capture antérieure. Le bon état serait que
`rules.v4` ne porte que les règles maison (`EGRESS-PHASE2`). Chantier ouvert.
:::

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

## Dashboard Homepage sans onglets, en anglais, ou sans alarme

Panne **discrete** : les services, les favoris et le theme s'affichent
normalement, mais la barre d'onglets a disparu, le titre est redevenu
« Homepage », et un service tombe ne colore plus sa carte. Cause : la page
statique Next.js n'a pas ete regeneree depuis le dernier demarrage du
conteneur, donc Homepage sert celle compilee dans l'image, sans configuration.

```bash
# Diagnostic : le titre doit etre celui de settings.yaml, pas "Homepage"
IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' homepage | awk '{print $1}')
curl -s -H "Host: home.gabin-simond.fr" "http://$IP:3000/" | grep -oE "<title[^>]*>[^<]*</title>"

# Correctif immediat
systemctl start homepage-revalidate.service
```

L'unite est declenchee par `docker.service`, donc au boot et au `restart docker`
nocturne de `dietpi-backup`. Si elle a echoue :
`journalctl -u homepage-revalidate -n 20`.

Pieges de diagnostic : `custom.css` n'est pas servi a la racine mais sous
`/api/config/custom.css` (un 404 sur `/custom.css` ne veut rien dire), et le
theme ne discrimine pas — `dark` et `slate` sont aussi les valeurs par defaut de
Homepage. Details : [services/homepage.md](../services/homepage.md).

---

## Nœud PVE mort sans laisser de trace — Oops kernel

Un nœud disparaît d'un coup, en pleine santé : dernière ligne de log à
`13:11:59`, corosync signale `link is down` à `13:12:03`, et plus rien. Aucune
séquence d'arrêt, aucun avertissement kernel, aucun précurseur matériel. Le nœud
ne répond plus ni au ping ni à l'ARP, et **ne redémarre jamais tout seul**.

Le réflexe naturel — « coupure d'alimentation » — est presque toujours faux ici.

### Le seul témoin est pstore, pas le journal

**Un Oops kernel n'atteint jamais le journal sur disque** : la machine meurt
avant l'écriture. Chercher dans `journalctl` ne donne donc rien, et cette absence
de trace se lit à tort comme « perte de courant ».

```bash
# INUTILE — retourne toujours 0, même après un vrai crash kernel
journalctl -b -1 | grep -c Oops

# LE BON ENDROIT — dumps EFI récupérés par systemd-pstore au démarrage suivant
ls -1 /var/lib/systemd/pstore/
for d in /var/lib/systemd/pstore/*/; do date -d @"$(basename "$d")"; done
```

Un répertoire dont l'horodatage correspond à la seconde de la mort **prouve**
que le kernel est passé par le chemin panic : une coupure d'alimentation ne peut
pas produire d'enregistrement pstore.

Pour extraire la signature :

```bash
grep -aiE "BUG:|Oops:|RIP:|Call Trace|Hardware name" \
  /var/lib/systemd/pstore/<timestamp>/*/dmesg.txt
```

:::warning[Ne jamais purger `/var/lib/systemd/pstore/`]
C'est la seule preuve exploitable d'un crash, et la vider ne libère rien :
`systemd-pstore` fait déjà `Unlink=yes` sur `/sys/fs/pstore`, donc la NVRAM
EFI est purgée à chaque démarrage. Sur ZimaBoard, les dumps ressortent
parfois à 0 octet — garder les anciens est alors la seule façon d'avoir une
signature lisible.
:::

### Cause racine constatée (2026-07-10 et 2026-08-05)

```
BUG: unable to handle page fault for address: 0000000100000028
Oops: 0000 [#2] SMP NOPTI
Hardware name: IceWhale ZimaBoard2, BIOS 5.27 07/22/2025
RIP: 0010:update_sd_lb_stats.constprop.0+0x93/0xbe0
     puis cpuidle_enter_state+0xc7/0x460
```

Crash dans le load-balancer du scheduler CFS, sur un pointeur corrompu de forme
`0xN00000028`, avec des Oops en cascade sur la même seconde. Kernel
`6.17.13-2-pve`, récurrence d'environ 2 à 3 semaines.

### Ce qui coûtait le plus cher : `panic_on_oops=0`

Avec le défaut Debian, un Oops laisse la machine **morte indéfiniment** au lieu
de redémarrer. Et sur ces cartes il n'existe aucune voie de récupération à
distance : pas de WoL configuré, pas de BMC ni d'IPMI sur une ZimaBoard, pas de
prise pilotable. Un crash de 5 secondes coûte donc plus d'une heure
d'indisponibilité et un déplacement physique — la ZimaBoard n'a pas de bouton
d'alimentation, le cycle se fait au jack DC.

Correctif déployé le 2026-08-05 sur galahad et lancelot
(`system/99-panic-on-oops.conf` dans homelab-config) :

```bash
kernel.panic_on_oops=1   # un Oops déclenche un panic...
kernel.panic=10          # ...qui redémarre au bout de 10 s
```

Soit ~2 min d'indisponibilité auto-résolue au lieu d'un trajet. C'est un filet
de sécurité, **pas** un correctif : la régression sched reste à traiter par un
upgrade kernel.

### Deux pièges de diagnostic rencontrés

Le journal local peut être **moins complet que le replica réseau**. Ici le
journal on-disk s'arrêtait à `13:11:26` (`system.journal corrupted or uncleanly
shut down, renaming and replacing`) alors qu'Alloy avait déjà expédié jusqu'à
`13:11:59`. Sur coupure franche, commencer par Loki, pas par la machine.

Et un double démarrage rapproché dans `journalctl --list-boots` n'est pas
forcément une boucle de reboot : vérifier s'il existe un enregistrement pstore
à cet horodatage. S'il n'y en a pas, c'est une coupure externe — typiquement le
jack DC débranché deux fois.

### Vérifier après le retour du nœud

```bash
touch /etc/pve/.rwtest && rm /etc/pve/.rwtest   # piège pmxcfs read-only
pvecm status | grep -E "Quorate|Total votes"
pct list                                        # guests redémarrés ?
pvesm status                                    # storage PBS repassé active ?
systemctl --failed
```

Voir aussi [pmxcfs stuck read-only après recovery node cluster](#pmxcfs-stuck-read-only-apres-recovery-node-cluster).
