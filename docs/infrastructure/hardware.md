# Hardware

## Materiel actuel

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

## Materiel prevu

| Machine | Specs | Role | Budget |
|---|---|---|---|
| ZimaBoard 2 x2 | 2x Ethernet chacun | Noeuds Proxmox VE (compute) | Deja en stock |
| Appliance firewall | 4x 2.5GbE, fanless (Topton/CWWK N100) | OPNsense dedie | 100-180€ |
| Minisforum N5 Max | Intel N100/N150, 16+ Go RAM | Proxmox VE (compute + storage / NAS) | 250-400€ |
| Switch manageable 2.5GbE | 16+ ports, 802.1Q | Switch coeur | 150-300€ |
| AP WiFi x2-3 | VLAN par SSID (Ubiquiti U6+ / TP-Link EAP) | WiFi segmente | 80-120€/AP |
| UPS / Onduleur | Protection coupure secteur | Switch + firewall + NAS | 60-100€ |

## Cablage

!!! success "Cat 8 deja en place"
    Cable **Cat 8 (S/FTP)** tire dans toutes les pieces principales lors de la renovation.
    Supporte 25/40GbE theorique — largement perenne.

!!! warning "Mise a la terre obligatoire"
    Le blindage S/FTP **doit** etre relie a la terre aux deux extremites (patch panel + keystone), sinon ca peut creer des interferences pires que du non-blinde.
    Les connecteurs et keystones doivent etre blindes / Cat 8 compatibles.
