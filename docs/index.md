# Homelab

Documentation du homelab : architecture actuelle et cible.

## Vue d'ensemble

Un homelab base sur un **Raspberry Pi 4** (actuellement) avec une architecture cible multi-machines pour une maison renovee.

```mermaid
graph LR
    Internet --> Freebox
    Freebox -->|WAN| OPNsense
    OPNsense -->|Trunk 802.1Q| Switch[Switch 2.5GbE]
    Switch --> RPi4[RPi 4<br/>DNS / Proxy / VPN]
    Switch --> Zima1[ZimaBoard #1<br/>Proxmox]
    Switch --> Zima2[ZimaBoard #2<br/>Proxmox]
    Switch --> Mini[Minisforum<br/>Proxmox + NAS]
    Switch --> WiFi[APs WiFi]
```

### Architecture actuelle

```mermaid
graph TB
    subgraph penny["penny (RPi 4 — 192.168.1.28)"]
        traefik[Traefik reverse proxy]
        adguard1[AdGuard Home primaire]
        authelia[Authelia SSO]
        homepage[Homepage]
        portainer[Portainer]
        beszel[Beszel]
        watchtower[Watchtower]
        autoheal[Autoheal]
    end

    subgraph galahad["galahad (ZimaBoard — 192.168.1.18)"]
        pve1[Proxmox VE 9]
        lxc100[LXC 100 — dns-failover<br/>AdGuard secondaire]
        lxc102[LXC 102 — vault<br/>Vaultwarden]
    end

    subgraph lancelot["lancelot (ZimaBoard — 192.168.1.19)"]
        pve2[Proxmox VE 9]
        lxc101[LXC 101 — logs<br/>Loki + Grafana]
    end

    traefik --> lxc102
    traefik --> lxc101
    traefik --> pve1
    traefik --> pve2
    adguard1 -.->|failover| lxc100
```

- **Raspberry Pi 4 (penny)** — appliance reseau (DNS, reverse proxy, SSO, VPN, monitoring)
- **DietPi** — distribution legere, optimisee headless
- **Docker** — tous les services containerises
- **SSD 480 Go** — stockage donnees via USB 3.0
- **2 ZimaBoards (galahad + lancelot)** — cluster Proxmox VE 9, LXC pour Vaultwarden, Grafana, DNS secondaire

### Architecture cible

- **3 noeuds Proxmox VE** — 2x ZimaBoard + 1x Minisforum N5 Max
- **Appliance OPNsense** — firewall dedie, segmentation VLANs
- **RPi 4** — DNS + reverse proxy (independant du cluster)
- **Cablage Cat 8** — infrastructure 2.5GbE

## Organisation des fichiers (RPi 4)

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
└── docker/                 # Docker data-root (images, volumes, overlay2)
```
