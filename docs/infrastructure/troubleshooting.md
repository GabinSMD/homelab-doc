# Troubleshooting

Problemes rencontres et leurs resolutions.

## SSD Argon Forty — deconnexions USB

### Symptomes

- `EXT4-fs (sdX): shut down requested (2)` dans dmesg
- `usb 2-2: USB disconnect` suivi de re-enumeration
- `device offline error, dev sdX`
- Services Docker inaccessibles (Docker root sur le SSD)
- Le device change de nom (`sda` → `sdb` → `sdc`) apres chaque reconnexion

### Cause racine

Le bridge USB-SATA **ASMedia ASM1156** (Argon Forty) est sensible a :

1. **PCIe ASPM** — le mode `powersave` fait tomber le lien PCIe du controleur VL805 USB
2. **Connecteur USB interne** — le dongle entre le socle SSD et le board RPi peut avoir un mauvais contact
3. **Port USB 3.0** — `"Cannot enable. Maybe the USB cable is bad?"` → fallback USB 2.0

### Fixes appliques

Dans `/boot/firmware/cmdline.txt` :

```
pcie_aspm=off usbcore.autosuspend=-1 usb-storage.quirks=174c:1156:u
```

| Parametre | Effet |
|---|---|
| `pcie_aspm=off` | Desactive le power management PCIe (fix principal) |
| `usbcore.autosuspend=-1` | Desactive l'USB autosuspend |
| `usb-storage.quirks=174c:1156:u` | Force `usb-storage` au lieu de UAS pour le bridge ASMedia |

### Procedure de recovery (SSD deconnecte)

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

Le script `homelab_monitor.sh` integre une **recovery automatique** en cas de deconnexion SSD :

1. **Stop Docker** en premier (libere les file handles sur le SSD)
2. **Double unmount** (`umount -f` + `umount -l`) pour nettoyer les mounts stale
3. Attend que le device reapparaisse **par UUID** jusqu'a 60s + 3s de stabilisation
4. `fsck.ext4 -y` sur le **nouveau** device (pas l'ancien)
5. Verifie le code retour fsck (abort si >= 4)
6. Remonte `/mnt/ssd` via fstab (UUID)
7. Redemarre Docker, attend 10s pour les containers
8. Notification ntfy "SSD RECOVERED" ou "RECOVERY FAILED"

!!! info "Changement de device name (sda → sdb)"
    Le bridge ASMedia re-enumere le SSD avec un nouveau nom apres chaque deconnexion (`sda` → `sdb` → `sdc`). La recovery utilise l'UUID (pas le nom de device) pour retrouver le SSD quel que soit son nouveau nom. Le fstab utilise aussi l'UUID.

**Rate limit** : max 3 tentatives par heure. Si les 3 echouent, alerte "SSD Recovery EPUISE — intervention manuelle requise."

La procedure manuelle ci-dessus reste utile si l'auto-recovery echoue ou si le SSD ne reapparait pas.

### Investigation en cours

Le support Argon a recommande :

1. ~~Tester avec un cable USB 3.0 A-A court au lieu du dongle integre~~ **Teste** — meme probleme de deconnexion qu'avec le dongle
2. Tester avec un SSD different (fanxiang S201 128 Go commande)
3. ~~Verifier les logs pour ecarter un probleme logiciel~~ **Elimine** — aucun processus particulier au moment du disconnect

**Conclusion provisoire** : le bridge ASMedia ASM1156 est la cause, ni le cable ni le dongle. Le SSD de remplacement sera le test definitif.

Donnees SMART : `UDMA_CRC_Error_Count = 4` (erreurs de communication SATA), pas de secteurs realloues.

## Proxmox VE 9 — installation sur eMMC

### Symptome

L'installeur Proxmox ne propose pas le device eMMC (`mmcblk0`) comme cible d'installation.

### Cause

Proxmox ne supporte pas les devices `mmcblk` dans sa logique de partitionnement.

### Workaround

Patcher l'installeur avant de lancer l'installation. Voir le [guide complet](../guides/proxmox-zimaboard.md).

## Proxmox VE 9 — repos et popup

### "No valid subscription"

Popup a chaque connexion a l'interface web.

**Fix** : le script `proxmox-post-install.sh` patche le fichier JS de l'interface web et redemarre `pveproxy`.

### "Some suites are misconfigured"

Les fichiers `.sources` enterprise sont encore presents.

**Fix** : le script supprime les fichiers `/etc/apt/sources.list.d/pve-enterprise.sources` et `ceph.sources`.

### "Warning: old suite bookworm"

Un fichier `.list` legacy avec la suite `bookworm` au lieu de `trixie`.

**Fix** : le script supprime `/etc/apt/sources.list.d/pve-no-subscription.list` (ancien format).

## Docker containers — DNS interne et OIDC

### Symptome

Les containers ne peuvent pas resoudre `*.home.gabin-simond.fr` (ex: `auth.home.gabin-simond.fr`).
Erreur typique : `dial tcp: lookup auth.home.gabin-simond.fr on 127.0.0.11:53: no such host`

### Cause

Les containers sur le reseau Docker `proxy` utilisent le DNS Docker interne (`127.0.0.11`) qui ne connait pas les rewrites AdGuard.

### Fix

Ajouter `dns: 192.168.1.28` dans le `docker-compose.yml` pour chaque container qui a besoin de resoudre des domaines locaux (Portainer, Beszel, Homepage, Vaultwarden).

```yaml
services:
  mon-service:
    dns:
      - 192.168.1.28
```

## Beszel — OIDC "Only superusers can perform this action"

### Symptome

Login OIDC via Authelia renvoie `403 — Only superusers can perform this action`.

### Cause

PocketBase (backend de Beszel) bloque la creation de comptes via OAuth2 par defaut.

### Workaround

1. Aller dans `/_/#/settings` → desactiver la restriction admin-only creation
2. Editer la collection `users` → API Rules → changer le "Create rule" en : `@request.context = "oauth2"`
3. Reactiver la restriction admin-only
4. Se connecter via OIDC (le compte est cree avec le role `user`)
5. Aller dans `/_/#/collections` → `users` → promouvoir le compte en `admin`

Source : [henrygd/beszel#291](https://github.com/henrygd/beszel/issues/291)

## Authelia — redirect_uri mismatch

### Symptome

Erreur `invalid_request` : `The 'redirect_uri' parameter does not match any of the OAuth 2.0 Client's pre-registered 'redirect_uris'.`

### Cause

L'URI de callback du service ne correspond pas exactement a ce qui est configure dans Authelia. Attention aux :

- Trailing slash (`/` vs pas de `/`)
- Chemins specifiques (`/api/oauth2-redirect`, `/identity/connect/oidc-signin`)

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

## Services inaccessibles via Tailscale VPN

### Symptome

Certains services (ex: `auth.home.gabin-simond.fr`, `vault.home.gabin-simond.fr`) ne chargent pas depuis un client Tailscale, alors qu'ils fonctionnent en local.

### Cause

Des **DNS Rewrites statiques** dans AdGuard (Filters > DNS Rewrites) ecrasent les `user_rules` conditionnelles. Les rewrites statiques sont appliquees en premier et renvoient toujours l'IP LAN (`192.168.1.28`), meme aux clients Tailscale qui ont besoin de l'IP Tailscale (`100.97.239.90`).

### Fix

Supprimer toutes les entrees dans **Filters > DNS Rewrites** pour les domaines `*.home.gabin-simond.fr`. Le wildcard dans `user_rules` gere deja tous les sous-domaines avec le bon routage conditionnel (LAN vs Tailscale).

Voir [Comment fonctionne le DNS](../guides/dns-flow.md#les-dns-rewrites-la-piece-cle) pour le detail des regles.

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

Le helper genere un nouveau mot de passe aleatoire.
