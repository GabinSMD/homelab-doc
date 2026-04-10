# Acces et URLs

Reference rapide de tous les services et leurs points d'acces.

## Services web

| Service | Port | Acces local | Acces Traefik |
|---|---|---|---|
| **Traefik** (dashboard) | 8080 | `http://IP:8080` | `traefik.home.*.fr` |
| **AdGuard Home** | 3000 | `http://IP:3000` | `adguard.home.*.fr` |
| **Portainer** | 9443 | `https://IP:9443` | `portainer.home.*.fr` |
| **Homepage** | 3100 | `http://IP:3100` | `home.*.fr` |
| **Wallos** | 8282 | `http://IP:8282` | `wallos.home.*.fr` |
| **Beszel** | 8090 | `http://IP:8090` | `monitor.home.*.fr` |
| **WUD** | 3001 | `http://IP:3001` | `wud.home.*.fr` |
| **Authelia** (SSO) | 9091 | — | `auth.home.*.fr` |
| **Vaultwarden** | 80 | — | `vault.home.*.fr` |
| **Proxmox pve1** | 8006 | `https://192.168.1.18:8006` | `pve1.home.*.fr` |
| **Proxmox pve2** | 8006 | `https://192.168.1.19:8006` | `pve2.home.*.fr` |

## Authentification

| Service | Methode | SSO Authelia |
|---|---|---|
| Proxmox | OIDC (`authelia` realm) | Oui |
| Portainer | OAuth2 | Oui |
| Beszel | OIDC (PocketBase) | Oui |
| Vaultwarden | Master password | Non (par design) |
| AdGuard | Login interne | Non |
| Autres | Login interne ou aucun | Non |

## Services reseau

| Service | Port | Protocole | Usage |
|---|---|---|---|
| **AdGuard DNS** | 53 | TCP/UDP | DNS resolver pour le LAN |
| **AdGuard DoT** | 853 | TCP | DNS-over-TLS |
| **AdGuard DHCP** | 67 | UDP | DHCP (optionnel) |
| **Traefik HTTP** | 80 | TCP | Redirige vers HTTPS |
| **Traefik HTTPS** | 443 | TCP | Reverse proxy TLS |
| **Portainer Edge** | 8000 | TCP | Portainer Edge agent |
| **Beszel Agent** | 45876 | TCP | Monitoring agent |

## Acces distant

| Methode | Detail |
|---|---|
| **Tailscale** | VPN mesh — acces a tous les services via IP Tailscale |
| **SSH** | Port 22, via Tailscale uniquement (recommande) |

## LXC Proxmox

| ID | Nom | Machine | IP | Role |
|---|---|---|---|---|
| 100 | guardian | pve1 | `192.168.1.30` | AdGuard secondaire + health check RPi |

## Reseaux Docker

| Reseau | Type | Usage |
|---|---|---|
| `proxy` | bridge | Services proxifies par Traefik |
| `host` | host | Tailscale, Beszel Agent |
