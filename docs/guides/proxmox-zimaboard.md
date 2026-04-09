# Installer Proxmox VE 9 sur ZimaBoard

Guide d'installation de Proxmox VE 9 (Trixie) sur ZimaBoard, qui boot sur eMMC.

## Prerequis

- Cle USB bootable avec l'ISO Proxmox VE 9
- Acces reseau (Ethernet)
- Un poste avec navigateur pour l'interface web

## Probleme : l'installeur Proxmox ne supporte pas l'eMMC

L'installeur Proxmox ne reconnait pas les devices `mmcblk` (eMMC) comme cible d'installation.
Il faut patcher l'installeur **avant** de lancer l'installation.

## Marche a suivre

### 1. Booter sur la cle USB Proxmox

Brancher la cle USB et booter dessus. A l'ecran de l'installeur, **ne pas lancer l'installation**.

### 2. Ouvrir un shell

Appuyer sur ++ctrl+alt+f2++ pour acceder a un terminal, ou utiliser le bouton "Debug" de l'installeur graphique.

### 3. Appliquer le patch eMMC

Depuis le RPi (ou un autre poste), servir le script :

```bash
# Sur le RPi
cd /mnt/ssd/homelab-config/scripts
python3 -m http.server 8888
```

Depuis le shell de l'installeur Proxmox, activer le reseau puis appliquer le patch :

```bash
ip link set enp1s0 up
dhclient enp1s0
wget -O- <IP_DU_RPI>:8888/proxmox-fix-emmc.sh | sh
dhclient -r enp1s0
```

!!! note "Pourquoi `dhclient -r` ?"
    Liberer le bail DHCP apres le patch pour que l'installeur Proxmox puisse configurer le reseau lui-meme proprement.

Le script patche `Proxmox::Sys::Block.pm` pour ajouter le support des devices `mmcblk`.

!!! info "Que fait le patch ?"
    Il ajoute un pattern matching pour `/dev/mmcblkX` dans la fonction qui genere les noms de partitions, permettant a l'installeur de creer `/dev/mmcblk0p1`, `/dev/mmcblk0p2`, etc.

### 4. Lancer l'installation

Revenir a l'installeur (++ctrl+alt+f1++ ou via le terminal graphique) et proceder normalement.
Selectionner le device eMMC comme cible.

### 5. Post-installation

Apres le reboot sur Proxmox, executer le script de post-installation :

```bash
wget -O- <IP_DU_RPI>:8888/proxmox-post-install.sh | bash
```

Ce script :

- **Supprime les repos enterprise** (qui necessitent un abonnement payant)
- **Nettoie les anciens fichiers `.list`** (evite le warning "old suite bookworm")
- **Ajoute le repo `pve-no-subscription`** (format `.sources` avec `Signed-By`)
- **Met a jour le systeme** (`apt update && apt dist-upgrade`)
- **Supprime le popup "No valid subscription"** (patch du JS de l'interface web)

!!! warning "Deconnexion de l'interface web"
    En derniere etape, le script redemarre `pveproxy` pour appliquer le patch.
    La session web sera coupee — il suffit de recharger la page et se reconnecter.

### 6. DNS et acces web

Chaque noeud est accessible de deux facons :

| Noeud | Acces direct (fallback) | Acces via Traefik |
|---|---|---|
| pve1 | `https://192.168.1.18:8006` | `https://pve1.home.gabin-simond.fr` |
| pve2 | `https://192.168.1.19:8006` | `https://pve2.home.gabin-simond.fr` |

La configuration se fait a trois endroits :

1. **DNS (AdGuard)** — rewrites vers le RPi (Traefik) :
    - `pve1.home.gabin-simond.fr` → `192.168.1.28`
    - `pve2.home.gabin-simond.fr` → `192.168.1.28`

2. **Traefik** — fichier `traefik/dynamic/proxmox.yml` :
    - Route le trafic vers `https://<IP_NODE>:8006`
    - Certificat TLS Let's Encrypt via DNS challenge Cloudflare

3. **Acces** — local et Tailscale uniquement (pas de DNS public)

!!! tip "Fallback"
    Si le RPi/Traefik est down, les noeuds restent accessibles via `https://IP:8006` (certificat auto-signe, warning navigateur).

## Scripts

| Script | Emplacement | Role |
|---|---|---|
| `proxmox-fix-emmc.sh` | `homelab-config/scripts/` | Patch installeur pour support eMMC |
| `proxmox-post-install.sh` | `homelab-config/scripts/` | Repos, update, suppression nag popup |

## Repetition

Repeter les etapes 1 a 6 pour chaque ZimaBoard.
