# VLANs

## Plan d'adressage

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

## Regles firewall (OPNsense)

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
