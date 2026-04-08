# Homelab

Documentation du homelab : architecture actuelle et cible.

## Hardware

| Composant | Detail |
|---|---|
| Board | Raspberry Pi 4 Model B Rev 1.4 (8 Go RAM) |
| Boitier | Argon ONE M.2 (avec ventilateur actif via `argononed`) |
| Stockage OS | SD Card 64 Go (boot + OS) |
| Stockage Data | SSD 480 Go via bridge USB-SATA ASMedia ASM1156 (USB 3.0, ~200 MB/s) |

## OS

| | |
|---|---|
| Distribution | DietPi v10.2 (base Debian 12 Bookworm) |
| Kernel | 6.12.x aarch64 (64-bit) |
| Mode | Headless (HDMI desactive, GPU 16 Mo) |
| WiFi | Desactive (overlay `disable-wifi`) |

## Reseau

| | |
|---|---|
| IP LAN | Statique |
| DNS upstream | Quad9 (`9.9.9.9` / `149.112.112.112`) |
| VPN | Tailscale (mesh) |
| Reverse proxy | Traefik + Let's Encrypt (DNS challenge Cloudflare) |

## Stack Docker

Tous les conteneurs tournent depuis un seul `docker-compose.yml`.
Docker data-root sur le SSD (`/mnt/ssd/docker`).

| Service | Image | Role |
|---|---|---|
| Traefik | `traefik:latest` | Reverse proxy + TLS auto |
| AdGuard Home | `adguard/adguardhome:latest` | DNS/DHCP ad-blocking |
| Portainer EE | `portainer/portainer-ee:latest` | Gestion Docker |
| Homepage | `ghcr.io/gethomepage/homepage:latest` | Dashboard |
| Wallos | `bellamy/wallos:latest` | Suivi abonnements |
| Beszel | `henrygd/beszel` + agent | Monitoring systeme |
| WUD | `getwud/wud` | Surveillance mises a jour containers |
| Tailscale | `tailscale/tailscale` | VPN mesh |

## Organisation des fichiers

```
/                           # SD Card (ext4, 64 Go)
├── /boot/firmware/         # Boot (config.txt, cmdline.txt)
└── / (rootfs)              # OS DietPi

/mnt/ssd/                   # SSD 480 Go (ext4, USB 3.0)
├── config/                 # Configs applicatives (bind mounts)
│   ├── docker-compose.yml  # Compose principal
│   ├── traefik/            # traefik.yml
│   ├── adguard/            # AdGuardHome.yaml
│   ├── homepage/           # settings, services, bookmarks...
│   └── beszel/
├── data/                   # Donnees persistantes
│   ├── beszel/             # Socket beszel
│   └── tailscale/          # State tailscale
├── docker/                 # Docker data-root (images, volumes, overlay2)
└── homelab-doc/            # Ce repo
```

## Optimisations appliquees

Voir [os-optimizations.md](os-optimizations.md) pour le detail complet.

Resume :
- **PCIe ASPM off** — empeche les deconnexions SSD via le bridge ASMedia
- **USB autosuspend off** — idem, double protection
- **UAS desactive** — force `usb-storage` (plus stable que UAS sur ce bridge)
- **SSD marque non-rotational** — I/O scheduler optimise pour SSD
- **Logs en tmpfs** — pas d'usure SD
- **Swap desactive** — pas d'usure SSD/SD
- **GPU minimal** (16 Mo) — plus de RAM pour les services
- **Headless** — HDMI off, framebuffers a 0
- **WiFi off** — economie energie, surface d'attaque reduite
- **fstrim hebdomadaire** — maintenance SSD (note : TRIM non supporte par le bridge ASMedia, effet nul mais sans risque)

---

## Architecture cible (maison)

Voir [target-architecture.md](target-architecture.md) pour le detail complet.
