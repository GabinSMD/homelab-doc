# Reseau cible

Architecture reseau prevue pour la maison renovee.

## Schema reseau

```mermaid
graph TB
    Internet[Internet] --> Freebox[Freebox<br/>bridge mode]
    Freebox -->|WAN| OPNsense[Appliance OPNsense<br/>4x 2.5GbE, dedie]
    
    OPNsense -->|"Trunk 802.1Q<br/>Cat 8"| Switch[Switch 2.5GbE manageable<br/>16+ ports]
    
    Switch -->|VLAN 10, 20| RPi4[RPi 4<br/>AdGuard + Traefik + Tailscale]
    Switch -->|VLAN 10, 20| Zima1[ZimaBoard #1<br/>Proxmox VE]
    Switch -->|VLAN 10, 20| Zima2[ZimaBoard #2<br/>Proxmox VE]
    Switch -->|VLAN 10, 20| Mini[Minisforum N5 Max<br/>Proxmox VE + NAS]
    Switch -->|VLAN 30, 40, 50| AP1[AP WiFi #1]
    Switch -->|VLAN 30, 40, 50| AP2[AP WiFi #2]
    
    style OPNsense fill:#e74c3c,color:#fff
    style RPi4 fill:#27ae60,color:#fff
    style Zima1 fill:#3498db,color:#fff
    style Zima2 fill:#3498db,color:#fff
    style Mini fill:#8e44ad,color:#fff
```

## Roles par machine

### Raspberry Pi 4 — Appliance reseau

!!! success "Independant du cluster"
    Si le cluster Proxmox tombe, le reseau continue de fonctionner.

- **AdGuard Home** — DNS principal + ad-blocking
- **Traefik** — reverse proxy + TLS auto
- **Tailscale** — VPN mesh distant
- **Beszel** — monitoring systeme
- **Homepage** — dashboard
- **Watchtower** — auto-update containers non-critiques + notif pour critiques

### Appliance OPNsense — Firewall dedie

Machine dediee bare-metal. Seul point de passage entre les VLANs et vers Internet.

| Port | Role |
|---|---|
| ETH0 | WAN (Freebox en bridge) |
| ETH1 | LAN trunk 802.1Q vers le switch |
| ETH2/ETH3 | Spare (DMZ, lien direct NAS, HA futur) |

Fonctions :

- Inter-VLAN routing avec regles firewall strictes
- DHCP server par VLAN
- OPNsense bare-metal pour la fiabilite

### ZimaBoard #1 + #2 — Compute

Deux noeuds Proxmox VE pour les services applicatifs en LXC/VM.

- Services legers : outils internes, dev, tests
- Proxmox Backup Server (en LXC sur un des deux)
- Avec le Minisforum → cluster Proxmox 3 noeuds (quorum natif)

### Minisforum N5 Max — Compute + Storage

Noeud Proxmox le plus puissant, double role.

- **NAS** — partage NFS/SMB vers les autres noeuds
- **Jellyfin** — media server avec transcodage hardware (Intel Quick Sync)
- **Services lourds** — VMs/LXC gourmands
- ZFS mirror recommande (minimum 2 disques)

## Plan VLANs

| VLAN ID | Nom | Subnet | Usage |
|---|---|---|---|
| 10 | Management | `10.0.10.0/24` | Admin switch, Proxmox, OPNsense, RPi SSH |
| 20 | Services | `10.0.20.0/24` | Containers, VMs, NAS, DNS, reverse proxy |
| 30 | LAN perso | `10.0.30.0/24` | Devices personnels (PC, tel, tablettes) |
| 40 | IoT | `10.0.40.0/24` | Domotique, cameras — isole |
| 50 | Invites | `10.0.50.0/24` | WiFi guest — acces internet uniquement |

## Matrice de flux

```mermaid
graph LR
    subgraph "Autorise"
        M[Management 10] -->|admin| S[Services 20]
        M -->|admin| L[LAN 30]
        M -->|admin| I[IoT 40]
        M -->|admin| G[Invites 50]
        L -->|DNS, NAS, media| S
        I -->|DNS uniquement| S
    end
    
    subgraph "Bloque"
        L -.->|X| M
        I -.->|X| L
        I -.->|X| M
        G -.->|X| M
        G -.->|X| S
        G -.->|X| L
        G -.->|X| I
    end
    
    style M fill:#e74c3c,color:#fff
    style S fill:#3498db,color:#fff
    style L fill:#27ae60,color:#fff
    style I fill:#f39c12,color:#fff
    style G fill:#95a5a6,color:#fff
```

## Regles firewall OPNsense

### VLAN 10 — Management

- :material-check: Acces a **tous** les VLANs (administration)
- :material-check: Acces internet

### VLAN 20 — Services

- :material-check: Acces internet
- :material-check: Acces NAS (VLAN 20 interne)
- :material-close: Pas d'acces au management (VLAN 10)

### VLAN 30 — LAN personnel

- :material-check: Acces internet
- :material-check: Acces services : DNS, NAS, Jellyfin (VLAN 20)
- :material-close: Pas d'acces management (VLAN 10)

### VLAN 40 — IoT / Domotique

- :material-check: Acces internet **limite**
- :material-check: Acces DNS uniquement (VLAN 20, port 53)
- :material-close: **Isole** de tout le reste (pas de LAN, pas de management)

### VLAN 50 — Invites

- :material-check: Acces internet uniquement
- :material-close: **Isole** de tout (pas de LAN, pas de services, pas d'IoT)

## WiFi et VLANs

Chaque VLAN qui necessite du WiFi a son propre SSID :

| SSID | VLAN | Usage |
|---|---|---|
| `HomeNet` | 30 | Devices personnels |
| `HomeIoT` | 40 | Objets connectes |
| `HomeGuest` | 50 | Invites |

Les APs WiFi (Ubiquiti / TP-Link EAP) recoivent un **trunk 802.1Q** et taguent le trafic par SSID.
