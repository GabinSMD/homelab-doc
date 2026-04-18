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
| SSH | `ssh -p 2806 -i ~/.ssh/homelab_recovery root@100.97.239.90` |

### ZimaBoard 2 x2 (cluster Proxmox)

| Composant | pve1 | pve2 |
|---|---|---|
| RAM | 16 Go | 16 Go |
| Stockage OS | eMMC 64 Go | eMMC 64 Go |
| NIC | 2x Intel i225 2.5GbE | 2x Intel i225 2.5GbE |
| OS | Proxmox VE 9 (Debian Trixie) | Proxmox VE 9 (Debian Trixie) |
| IP LAN | 192.168.1.18 | 192.168.1.19 |
| IP Tailscale | 100.98.58.121 | 100.69.6.13 |
| Acces web | `pve1.home.gabin-simond.fr` | `pve2.home.gabin-simond.fr` |
| SSH | `ssh root@pve1` | `ssh root@pve2` |

Les deux ZimaBoards forment le cluster Proxmox **homelab**. NICs 2.5GbE natifs Intel i225.

#### Accessoires ZimaBoard (recus)

| Accessoire | Quantite | Affectation |
|---|---|---|
| Adaptateur PCIe NVMe | 1x | pve1 — stockage VM rapide |
| Cable SATA-Y | 2x | pve1 + pve2 — disques additionnels |
| 2-Bay HDD Rack Tray | 1x | pve1 — rack pour WD 2TB |
| Adaptateur USB WiFi6 | 1x | Reserve (future AP soft ou OPNsense) |
| GPU Docking Station | 1x | pve2 — GPU passthrough (transcoding Jellyfin) |

!!! warning "PCIe = NVMe OU GPU, pas les deux"
    Le ZimaBoard 2 n'a qu'un seul slot PCIe. pve1 utilise le slot pour le NVMe, pve2 pour le GPU Docking Station.

### Switch 2.5G 8 ports (distribution)

| Composant | Detail |
|---|---|
| Ports | 8x 2.5G Base-T + 1x 10G SFP |
| Features | 802.1Q VLAN, QoS, IGMP, 802.3ad LAG |
| Role | Distribution VLANs, interconnexion serveurs 2.5G |
| Uplink SFP | Reserve pour futur NAS/OPNsense 10G |

### EdgeRouter Lite (Ubiquiti)

| Composant | Detail |
|---|---|
| Ports | 3x Gigabit Ethernet RJ45 |
| CPU | Cavium Octeon MIPS64 dual-core 500MHz |
| RAM | 512 Mo |
| OS | EdgeOS (base Vyatta) |
| Role | Routeur principal, NAT, firewall stateful, VLANs 802.1Q |

**Cablage cible :**

```
Internet
  └── Freebox (mode bridge)
        └── [eth0] EdgeRouter Lite [eth1] ──(1G trunk)──► Switch 2.5G
                       [eth2] Management direct                  │
                                               ┌─────────────────┤
                                          [2.5G] pve1      [2.5G] pve2
                                          [1G]   RPi 4     [libre] PC, APs
                                          [SFP 10G] futur NAS/OPNsense
```

### WD Caviar Green 2TB (WD20EARS)

| Composant | Detail |
|---|---|
| Capacite | 2 To |
| Type | HDD 3.5", 5400 RPM, 64 Mo cache |
| Interface | SATA |
| Affectation | pve1 — datastore Proxmox Backup Server |
| Montage | 2-Bay HDD Rack Tray sur pve1, cable SATA-Y |

!!! warning "IntelliPark WD Green"
    Le WD Green gare sa tete de lecture toutes les 8 secondes par defaut — catastrophique pour un usage NAS/serveur. A desactiver des le branchement :
    ```bash
    hdparm -B 255 /dev/sdX   # desactive le power management agressif
    ```

## Materiel prevu

| Machine | Specs | Role | Budget |
|---|---|---|---|
| Appliance firewall | 4x 2.5GbE, fanless (Topton/CWWK N100) | OPNsense dedie (si EdgeRouter Lite insuffisant) | 100-180€ |
| Minisforum N5 Max | Intel N100/N150, 16+ Go RAM | Proxmox VE (compute + storage / NAS) | 250-400€ |
| Switch 2.5GbE 16+ ports | 802.1Q managed | Switch coeur si expansion | 150-300€ |
| AP WiFi x2-3 | VLAN par SSID (Ubiquiti U6+ / TP-Link EAP) | WiFi segmente | 80-120€/AP |
| UPS / Onduleur | Protection coupure secteur | Switch + firewall + NAS | 60-100€ |

## Cablage

!!! success "Cat 8 deja en place"
    Cable **Cat 8 (S/FTP)** tire dans toutes les pieces principales lors de la renovation.
    Supporte 25/40GbE theorique — largement perenne.

!!! warning "Mise a la terre obligatoire"
    Le blindage S/FTP **doit** etre relie a la terre aux deux extremites (patch panel + keystone), sinon ca peut creer des interferences pires que du non-blinde.
    Les connecteurs et keystones doivent etre blindes / Cat 8 compatibles.
