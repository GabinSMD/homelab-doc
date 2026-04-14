# Hardware

## Materiel actuel

### Raspberry Pi 4 (services Docker)

| Composant | Detail |
|---|---|
| Board | Raspberry Pi 4 Model B Rev 1.4 (8 Go RAM) |
| Boitier | Argon ONE M.2 (avec ventilateur actif via `argononed`) |
| Stockage OS | SD Card 64 Go (boot + OS) |
| Stockage Data | SSD Intenso 480 Go via bridge USB-SATA ASMedia ASM1156 (USB 3.0) |
| OS | DietPi v10.2 (Debian 12 Bookworm), kernel 6.12.x aarch64 |
| IP LAN | 192.168.1.28 |
| IP Tailscale | 100.97.239.90 |
| SSH | `ssh root@homelab` (Tailscale SSH) |

### ZimaBoard x2 (cluster Proxmox)

| Composant | galahad | lancelot |
|---|---|---|
| Stockage | eMMC 32 Go | eMMC 32 Go |
| OS | Proxmox VE 9 (Debian Trixie) | Proxmox VE 9 (Debian Trixie) |
| IP LAN | 192.168.1.18 | 192.168.1.19 |
| IP Tailscale | 100.98.58.121 | 100.69.6.13 |
| Acces web | `galahad.home.gabin-simond.fr` | `lancelot.home.gabin-simond.fr` |
| SSH | `ssh root@galahad` | `ssh root@lancelot` |

Les deux ZimaBoards forment le cluster Proxmox **homelab**. Tailscale installe nativement.

## Materiel prevu

| Machine | Specs | Role | Budget |
|---|---|---|---|
| Switch 2.5GbE | keepLINK 9XHML-X 8p managed | Switch pour tests Phase 1 | ~62€ |
| Appliance firewall | 4x 2.5GbE, fanless (Topton/CWWK N100) | OPNsense dedie | 100-180€ |
| Minisforum N5 Max | Intel N100/N150, 16+ Go RAM | Proxmox VE (compute + storage / NAS) | 250-400€ |
| Switch 2.5GbE 16+ ports | 802.1Q managed | Switch coeur (Phase 2) | 150-300€ |
| AP WiFi x2-3 | VLAN par SSID (Ubiquiti U6+ / TP-Link EAP) | WiFi segmente | 80-120€/AP |
| UPS / Onduleur | Protection coupure secteur | Switch + firewall + NAS | 60-100€ |

## Cablage

!!! success "Cat 8 deja en place"
    Cable **Cat 8 (S/FTP)** tire dans toutes les pieces principales lors de la renovation.
    Supporte 25/40GbE theorique — largement perenne.

!!! warning "Mise a la terre obligatoire"
    Le blindage S/FTP **doit** etre relie a la terre aux deux extremites (patch panel + keystone), sinon ca peut creer des interferences pires que du non-blinde.
    Les connecteurs et keystones doivent etre blindes / Cat 8 compatibles.
