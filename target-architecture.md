# Architecture cible — Homelab maison

## Objectifs

- Segmentation reseau entreprise (VLANs, firewall)
- Infrastructure 2.5GbE de bout en bout
- Separation des roles : reseau, compute, stockage
- Pas de SPOF (Single Point of Failure) sur les services critiques (DNS, firewall)

## Hardware

### Existant

| Machine | Specs | Role |
|---|---|---|
| Raspberry Pi 4 Model B | 8 Go RAM, SSD 480 Go (USB 3.0) | Appliance reseau (DNS, reverse proxy, VPN, monitoring) |
| ZimaBoard 2 #1 | 2x Ethernet | Firewall / routeur (OPNsense dedie) |
| ZimaBoard 2 #2 | 2x Ethernet | Noeud Proxmox VE (compute) |

### A acquerir

| Machine | Specs recommandees | Role |
|---|---|---|
| Minisforum N5 Max (ou equiv.) | Intel N100/N150, 16+ Go RAM, multi-disques | Noeud Proxmox VE (compute + storage / NAS) |
| Switch manageable 2.5GbE | 16+ ports, 802.1Q VLAN, ex: MokerLink 16p / QNAP QSW-M2116P | Switch coeur |
| AP WiFi x2-3 | VLAN par SSID, ex: Ubiquiti U6+ / TP-Link EAP series | WiFi segmente par VLAN |
| Patch panel Cat 6A | 24 ports | Coffret technique |
| UPS / Onduleur | Petit onduleur pour proteger switch + firewall + NAS | Protection coupure secteur |

## Schema reseau

```
Internet
    |
Freebox (bridge mode) ─── uniquement modem
    |
    | WAN
ZimaBoard #1 (OPNsense) ─── firewall / routeur / inter-VLAN routing
    |
    | LAN trunk (802.1Q, tous VLANs)
    |
Switch manageable 2.5GbE ─── coeur de reseau
    |
    ├── VLAN 10 — Management
    |     ├── ZimaBoard #1 (OPNsense, interface admin)
    |     ├── ZimaBoard #2 (Proxmox, interface admin)
    |     ├── Minisforum (Proxmox, interface admin)
    |     ├── RPi 4 (acces SSH/admin)
    |     └── Switch (interface admin)
    |
    ├── VLAN 20 — Services / Infra
    |     ├── RPi 4 — AdGuard Home (DNS), Traefik (reverse proxy), Tailscale (VPN)
    |     ├── ZimaBoard #2 — VMs/LXC applicatifs (Proxmox)
    |     └── Minisforum — NAS (NFS/SMB), Jellyfin, VMs/LXC (Proxmox)
    |
    ├── VLAN 30 — LAN personnel
    |     ├── PCs, telephones, tablettes
    |     └── WiFi principal (SSID dedie)
    |
    ├── VLAN 40 — IoT / Domotique
    |     ├── Cameras, capteurs, hub Zigbee/Z-Wave
    |     └── WiFi IoT (SSID dedie, isole)
    |
    └── VLAN 50 — Invites
          └── WiFi guest (SSID dedie, isole, acces internet uniquement)
```

## Roles par machine

### Raspberry Pi 4 — Appliance reseau (DietPi + Docker)

Independant du cluster Proxmox. Si le cluster tombe, le reseau fonctionne toujours.

- **AdGuard Home** — DNS principal + ad-blocking pour tout le reseau
- **Traefik** — reverse proxy + TLS auto (Let's Encrypt / Cloudflare)
- **Tailscale** — acces VPN mesh distant
- **Beszel** — monitoring systeme
- **Homepage** — dashboard
- **WUD** — surveillance mises a jour containers

### ZimaBoard #1 — Firewall dedie (OPNsense)

Machine dediee, pas de VM/conteneur. C'est le seul point de passage entre les VLANs
et vers Internet. Dedie = pas de SPOF.

- Port ETH0 → WAN (Freebox en bridge)
- Port ETH1 → LAN trunk 802.1Q vers le switch
- Inter-VLAN routing avec regles firewall strictes
- DHCP server par VLAN (ou relay vers AdGuard)
- Pas de Proxmox ici — OPNsense bare-metal pour la fiabilite

### ZimaBoard #2 — Compute (Proxmox VE)

Noeud Proxmox pour les services applicatifs en LXC/VM.

- Services legers : outils internes, dev, tests
- Proxmox Backup Server (en LXC) pour les backups du cluster

### Minisforum N5 Max — Compute + Storage (Proxmox VE)

Noeud Proxmox le plus puissant, double role compute et stockage.

- **NAS** — partage NFS/SMB vers les autres noeuds (stockage VMs + donnees)
- **Jellyfin** — media server avec transcodage hardware (Intel Quick Sync)
- **Services lourds** — VMs/LXC gourmands en ressources
- ZFS mirror recommande (minimum 2 disques) pour la fiabilite du stockage

## Plan VLANs

| VLAN ID | Nom | Subnet (exemple) | Usage |
|---|---|---|---|
| 10 | Management | 10.0.10.0/24 | Admin switch, Proxmox, OPNsense, RPi SSH |
| 20 | Services | 10.0.20.0/24 | Containers, VMs, NAS, DNS, reverse proxy |
| 30 | LAN perso | 10.0.30.0/24 | Devices personnels (PC, tel, tablettes) |
| 40 | IoT | 10.0.40.0/24 | Domotique, cameras — isole, pas d'acces au LAN |
| 50 | Invites | 10.0.50.0/24 | WiFi guest — acces internet uniquement |

### Regles firewall inter-VLAN (OPNsense)

- **Management (10)** → acces a tout (admin)
- **Services (20)** → acces internet, acces NAS, pas d'acces management
- **LAN perso (30)** → acces internet, acces services (DNS, NAS, Jellyfin), pas d'acces management
- **IoT (40)** → acces internet limite, acces DNS uniquement, pas d'acces LAN/services
- **Invites (50)** → acces internet uniquement, isole de tout le reste

## Cablage maison

- **Cat 6A** partout (supporte 10GbE, perenne 15+ ans)
- **2 prises minimum par piece**, 4 dans bureau/salon
- **Gaines ICTA** vers chaque piece (meme sans cable, la gaine est la pour plus tard)
- **Coffret technique centralise** (garage ou placard) : patch panel, switch, firewall, UPS
- **Cables pour les APs WiFi** — prevoir un cable Cat 6A au plafond de chaque zone a couvrir

## Roadmap d'installation

### Phase 1 — Maintenant (preparation)

- [x] RPi 4 configure et operationnel
- [ ] Installer Proxmox VE sur ZimaBoard #2
- [ ] Installer OPNsense sur ZimaBoard #1
- [ ] Tester les VLANs avec un petit switch manageable (TP-Link SG108E ~30€)
- [ ] Se familiariser avec OPNsense et Proxmox

### Phase 2 — Avant emmenagement

- [ ] Acheter switch 2.5GbE manageable (16+ ports)
- [ ] Acheter APs WiFi (VLAN-capable)
- [ ] Acheter patch panel Cat 6A + coffret mural/baie 6U
- [ ] Preparer le cablage (Cat 6A + gaines ICTA)

### Phase 3 — Installation maison

- [ ] Tirer les cables Cat 6A vers chaque piece
- [ ] Installer coffret technique (patch panel + switch + firewall + UPS)
- [ ] Deployer OPNsense + VLANs en production
- [ ] Installer les APs WiFi (1 SSID par VLAN necessaire)
- [ ] Migrer les services du RPi vers le cluster si pertinent

### Phase 4 — Consolidation

- [ ] Acheter Minisforum N5 Max (ou equivalent)
- [ ] Ajouter comme 3eme noeud Proxmox (compute + storage)
- [ ] Configurer ZFS mirror pour le stockage
- [ ] Mettre en place les backups (Proxmox Backup Server sur ZimaBoard #2 → NAS)
- [ ] Deployer AdGuard secondaire en LXC (redondance DNS)
- [ ] UPS pour le coffret technique
