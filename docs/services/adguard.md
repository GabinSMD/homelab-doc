# AdGuard Home

DNS et DHCP avec ad-blocking pour tout le reseau.

## Role

- **DNS resolver** principal pour le reseau local
- **Ad-blocking** au niveau DNS (listes de blocage)
- **DNS-over-TLS** sur le port 853
- **DHCP** (optionnel, peut etre gere par OPNsense a terme)

## Ports

| Port | Protocole | Usage |
|---|---|---|
| 53 | TCP/UDP | DNS standard |
| 853 | TCP | DNS-over-TLS |
| 67 | UDP | DHCP |
| 3000 | TCP | Interface web |

## DNS upstream

| Serveur | IP |
|---|---|
| Quad9 (principal) | `9.9.9.9` |
| Quad9 (secondaire) | `149.112.112.112` |

## Stockage

- **Config** : bind mount `/mnt/ssd/config/adguard/` → `/opt/adguardhome/conf`
- **Donnees** : Docker volume `adguard-data` → `/opt/adguardhome/work`

## Evolution prevue

!!! tip "Redondance DNS"
    Dans l'architecture cible, un **second AdGuard Home** sera deploye en LXC sur le cluster Proxmox pour assurer la redondance DNS. Le DHCP distribuera les deux adresses DNS.
