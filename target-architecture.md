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
| ZimaBoard 2 #1 | 2x Ethernet | Noeud Proxmox VE #1 (compute) |
| ZimaBoard 2 #2 | 2x Ethernet | Noeud Proxmox VE #2 (compute) |

### Cablage en place

- **Cat 8 (S/FTP)** tire dans toutes les pieces principales (renovation)
- Supporte 25/40GbE theorique — largement perenne
- **Important** : le blindage S/FTP doit etre relie a la terre aux deux extremites
  (patch panel + keystone) sous peine d'interferences
- Connecteurs et keystones doivent etre blindes/Cat 8 compatibles

### A acquerir

| Machine | Specs recommandees | Role | Budget estime |
|---|---|---|---|
| Appliance firewall | 4x 2.5GbE, fanless (Topton/CWWK N100 ou Protectli VP2420) | OPNsense dedie | 100-180€ |
| Minisforum N5 Max (ou equiv.) | Intel N100/N150, 16+ Go RAM, multi-disques | Noeud Proxmox VE #3 (compute + storage / NAS) | 250-400€ |
| Switch manageable 2.5GbE | 16+ ports, 802.1Q VLAN, ex: MokerLink 16p / QNAP QSW-M2116P | Switch coeur | 150-300€ |
| AP WiFi x2-3 | VLAN par SSID, ex: Ubiquiti U6+ / TP-Link EAP series | WiFi segmente par VLAN | 80-120€/AP |
| Patch panel Cat 8 / Cat 6A blinde | 24 ports, blinde | Coffret technique | 30-50€ |
| UPS / Onduleur | Petit onduleur pour proteger switch + firewall + NAS | Protection coupure secteur | 60-100€ |

## Schema reseau

```
Internet
    |
Freebox (bridge mode) ─── uniquement modem
    |
    | WAN
Appliance OPNsense (dediee, 4x 2.5GbE) ─── firewall / routeur / inter-VLAN routing
    |
    | LAN trunk (802.1Q, tous VLANs) — Cat 8
    |
Switch manageable 2.5GbE ─── coeur de reseau
    |
    ├── VLAN 10 — Management
    |     ├── Appliance OPNsense (interface admin)
    |     ├── ZimaBoard #1 (Proxmox, interface admin)
    |     ├── ZimaBoard #2 (Proxmox, interface admin)
    |     ├── Minisforum (Proxmox, interface admin)
    |     ├── RPi 4 (acces SSH/admin)
    |     └── Switch (interface admin)
    |
    ├── VLAN 20 — Services / Infra
    |     ├── RPi 4 — AdGuard Home (DNS), Traefik (reverse proxy), Tailscale (VPN)
    |     ├── ZimaBoard #1 — VMs/LXC applicatifs (Proxmox)
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

### Appliance OPNsense — Firewall dedie (bare-metal)

Machine dediee, pas de VM/conteneur. C'est le seul point de passage entre les VLANs
et vers Internet. Dedie = pas de SPOF.

- Port ETH0 → WAN (Freebox en bridge)
- Port ETH1 → LAN trunk 802.1Q vers le switch
- Port ETH2/ETH3 → spare (DMZ, lien direct NAS, HA futur)
- Inter-VLAN routing avec regles firewall strictes
- DHCP server par VLAN (ou relay vers AdGuard)
- OPNsense bare-metal pour la fiabilite

### ZimaBoard #1 + #2 — Compute (Proxmox VE, cluster)

Deux noeuds Proxmox pour les services applicatifs en LXC/VM.

- Services legers : outils internes, dev, tests
- Proxmox Backup Server (en LXC sur un des deux) pour les backups du cluster
- Avec le Minisforum, forment un cluster Proxmox 3 noeuds (quorum natif)

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

- **Cat 8 (S/FTP) deja tire** dans toutes les pieces principales (renovation)
- Blindage S/FTP relie a la terre aux deux extremites (patch panel + keystone)
- Connecteurs et keystones blindes Cat 8 compatibles
- **Coffret technique centralise** (garage ou placard) : patch panel, switch, firewall, UPS
- **Cables pour les APs WiFi** — cable Cat 8 au plafond de chaque zone a couvrir

## Roadmap d'installation

### Phase 1 — Maintenant (preparation)

- [x] RPi 4 configure et operationnel
- [x] Cablage Cat 8 tire dans les pieces principales
- [ ] Installer Proxmox VE sur les 2 ZimaBoard
- [ ] Tester les VLANs avec un petit switch manageable (TP-Link SG108E ~30€)
- [ ] Se familiariser avec Proxmox (LXC, VM, cluster)

### Phase 2 — Avant emmenagement

- [ ] Acheter appliance OPNsense (Topton/CWWK N100 4x 2.5GbE, ~120€)
- [ ] Acheter switch 2.5GbE manageable (16+ ports)
- [ ] Acheter APs WiFi (VLAN-capable)
- [ ] Acheter patch panel Cat 8 blinde + coffret mural/baie 6U
- [ ] Installer OPNsense sur l'appliance, tester les VLANs

### Phase 3 — Installation maison

- [ ] Installer coffret technique (patch panel + switch + firewall + UPS)
- [ ] Raccorder les cables Cat 8 (keystones blindes + mise a la terre)
- [ ] Deployer OPNsense + VLANs en production
- [ ] Freebox en bridge mode
- [ ] Installer les APs WiFi (1 SSID par VLAN)
- [ ] Migrer les services du RPi vers le cluster si pertinent

### Phase 4 — Consolidation

- [ ] Acheter Minisforum N5 Max (ou equivalent)
- [ ] Ajouter comme 3eme noeud Proxmox (compute + storage) → quorum natif
- [ ] Configurer ZFS mirror pour le stockage
- [ ] Mettre en place les backups (Proxmox Backup Server sur ZimaBoard → NAS)
- [ ] Deployer AdGuard secondaire en LXC (redondance DNS)
- [ ] UPS pour le coffret technique
