# Installer Proxmox VE 9 sur ZimaBoard

Guide d'installation de Proxmox VE 9 (Trixie) sur ZimaBoard, qui boot sur eMMC.

## Prerequis

- Clé USB bootable avec l'ISO Proxmox VE 9
- Acces réseau (Ethernet)
- Un poste avec navigateur pour l'interface web

## Problème : l'installeur Proxmox ne supporte pas l'eMMC

L'installeur Proxmox ne reconnait pas les devices `mmcblk` (eMMC) comme cible d'installation.
Il faut patcher l'installeur **avant** de lancer l'installation.

## Marche a suivre

### 1. Booter sur la clé USB Proxmox

Brancher la clé USB et booter dessus. A l'écran de l'installeur, **ne pas lancer l'installation**.

### 2. Ouvrir un shell

Appuyer sur ++ctrl+alt+f2++ pour acceder a un terminal, ou utiliser le bouton "Debug" de l'installeur graphique.

### 3. Appliquer le patch eMMC

Depuis le RPi (ou un autre poste), servir le script :

```bash
# Sur le RPi
cd /mnt/ssd/homelab-config/scripts
python3 -m http.server 8888
```

Depuis le shell de l'installeur Proxmox, activer le réseau puis appliquer le patch :

```bash
ip link set enp1s0 up
dhclient enp1s0
wget -O- <IP_DU_RPI>:8888/proxmox-fix-emmc.sh | sh
dhclient -r enp1s0
```

!!! note "Pourquoi `dhclient -r` ?"
    Libérer le bail DHCP après le patch pour que l'installeur Proxmox puisse configurer le réseau lui-même proprement.

Le script patche `Proxmox::Sys::Block.pm` pour ajouter le support des devices `mmcblk`.

!!! info "Que fait le patch ?"
    Il ajoute un pattern matching pour `/dev/mmcblkX` dans la fonction qui généré les noms de partitions, permettant a l'installeur de créer `/dev/mmcblk0p1`, `/dev/mmcblk0p2`, etc.

### 4. Lancer l'installation

Revenir a l'installeur (++ctrl+alt+f1++ ou via le terminal graphique) et proceder normalement.
Sélectionner le device eMMC comme cible.

### 5. Post-installation

Après le reboot sur Proxmox, exécuter le script de post-installation :

```bash
wget -O- <IP_DU_RPI>:8888/proxmox-post-install.sh | bash
```

Ce script :

- **Supprimé les repos enterprise** (qui nécessitent un abonnement payant)
- **Nettoie les anciens fichiers `.list`** (évite le warning "old suite bookworm")
- **Ajoute le repo `pve-no-subscription`** (format `.sources` avec `Signed-By`)
- **Met a jour le système** (`apt update && apt dist-upgrade`)
- **Supprimé le popup "No valid subscription"** (patch du JS de l'interface web)

!!! warning "Déconnexion de l'interface web"
    En dernière étape, le script redémarre `pveproxy` pour appliquer le patch.
    La session web sera coupee — il suffit de recharger la page et se reconnecter.

### 6. DNS et acces web

Chaque nœud est accessible de deux facons :

| Nœud | Acces direct (fallback) | Acces via Traefik |
|---|---|---|
| galahad | `https://192.168.1.18:8006` | `https://galahad.home.gabin-simond.fr` |
| lancelot | `https://192.168.1.19:8006` | `https://lancelot.home.gabin-simond.fr` |

La configuration se fait a trois endroits :

1. **DNS (AdGuard)** — rewrites vers le RPi (Traefik) :
    - `galahad.home.gabin-simond.fr` → `192.168.1.28`
    - `lancelot.home.gabin-simond.fr` → `192.168.1.28`

2. **Traefik** — fichier `traefik/dynamic/proxmox.yml` :
    - Route le trafic vers `https://<IP_NODE>:8006`
    - Certificat TLS Let's Encrypt via DNS challenge Cloudflare

3. **Acces** — local et Tailscale uniquement (pas de DNS public)

!!! tip "Fallback"
    Si le RPi/Traefik est down, les nœuds restent accessibles via `https://IP:8006` (certificat auto-signe, warning navigateur).

## Scripts

| Script | Emplacement | Rôle |
|---|---|---|
| `proxmox-fix-emmc.sh` | `homelab-config/scripts/` | Patch installeur pour support eMMC |
| `proxmox-post-install.sh` | `homelab-config/scripts/` | Repos, update, suppression nag popup |

### 7. Configurer l'authentification Authelia (OIDC)

Après avoir configuré Authelia sur le RPi (voir [authelia.md](../services/authelia.md)), ajouter le realm OIDC sur un nœud du cluster :

```bash
pveum realm add authelia --type openid \
  --issuer-url https://auth.home.gabin-simond.fr \
  --client-id proxmox \
  --client-key <CLIENT_SECRET> \
  --username-claim preferred_username \
  --autocreate

# Realm par defaut + nom affiche
pveum realm modify authelia --default 1
pveum realm modify authelia --comment 'Authelia'

# ACL admin
pveum acl modify / --user gabins@authelia --role Administrator
```

La config se propage automatiquement via `/etc/pve/domains.cfg` — pas besoin de repeter sur chaque nœud.

!!! info "Trois realms conserves"
    **Authelia** (OIDC, defaut) pour le quotidien, **Linux PAM** pour l'acces d'urgence via `root@pam`, **PVE** pour les comptes de service/API. Ne jamais supprimer PAM — c'est le filet de sécurité si Authelia est down.

## Repetition

Repeter les étapes 1 a 6 pour chaque ZimaBoard. L'étape 7 (realm OIDC) ne se fait qu'une seule fois, la config est partagée dans le cluster.
