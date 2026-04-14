# Acces et URLs

Reference rapide — tous les services et leurs points d'acces.

## Services web (via Traefik)

| Service | URL publique (home.gabin-simond.fr) | Auth | Host |
|---|---|---|---|
| **Homepage** | `home.*` | ForwardAuth Authelia | penny |
| **Traefik dashboard** | `traefik.home.*` | ForwardAuth Authelia | penny |
| **AdGuard primaire** | `adguard.home.*` | ForwardAuth Authelia + bcrypt | penny (host net) |
| **AdGuard dns-failover** | `dns-failover.home.*` | ForwardAuth Authelia + bcrypt | LXC dns-failover / galahad |
| **Authelia (SSO)** | `auth.home.*` | MFA TOTP + YubiKey | penny |
| **Portainer** | `portainer.home.*` | OIDC Authelia (SSO auto-login, internal hidden) | penny |
| **Beszel (monitoring)** | `monitor.home.*` | OIDC Authelia (one_factor) | penny |
| **Grafana (logs)** | `logs.home.*` | OIDC Authelia (two_factor + PKCE, auto-login) | LXC logs / lancelot |
| **Watchtower** | — (headless, pas de dashboard) | — | penny |
| **Vaultwarden** | `vault.home.*` | Master + TOTP | LXC vault / galahad |
| **Proxmox galahad** | `galahad.home.*` | OIDC Authelia / root@pam | galahad (bare metal) |
| **Proxmox lancelot** | `lancelot.home.*` | OIDC Authelia / root@pam | lancelot (bare metal) |
| **Docs** | `homelab.gabin-simond.fr` | Aucune (publique) | hors infra |

## Services reseau (ports ouverts)

| Service | Port | Protocole | Scope firewall |
|---|---|---|---|
| AdGuard DNS | 53 | TCP/UDP | Tous |
| AdGuard DoT | 853 | TCP | Tous |
| Traefik HTTP → HTTPS | 80 | TCP | Tous |
| Traefik HTTPS | 443 | TCP | Tous |
| SSH penny | 2806 | TCP | Tous (cle obligatoire) |
| SSH galahad | 2807 | TCP | Tous (cle obligatoire) |
| SSH lancelot | 2808 | TCP | Tous (cle obligatoire) |
| AdGuard UI | 3000 | TCP | LAN + Tailscale |
| Beszel Agent | 45876 | TCP | LAN + Tailscale |

Tout le reste est DROP.

## Acces distant

| Methode | Detail |
|---|---|
| Tailscale | VPN mesh, acces a tous les services via IP Tailscale (`100.64.0.0/10`) |
| Tailscale SSH | Mode `check` (navigateur MFA), certs auto-rotated, pas de port 22 expose |

## LXC Proxmox

| ID | Nom | Host | IP LAN | Role |
|---|---|---|---|---|
| 100 | dns-failover | galahad | `192.168.1.30` | AdGuard secondaire + health check penny |
| 101 | logs | lancelot | `192.168.1.31` | Loki + Grafana |
| 102 | vault | galahad | `192.168.1.32` | Vaultwarden |

Note d'isolement : `vault` et `logs` sont sur des hosts differents (galahad vs lancelot) — si un node tombe, on ne perd pas simultanement les secrets ET les logs.

## Reseaux Docker (penny)

| Reseau | Type | Usage |
|---|---|---|
| `proxy` | bridge | Services reverse-proxies par Traefik |
| `socket` | bridge (internal) | Clients de socket-proxy (Traefik, Homepage, Watchtower, autoheal) |
| `host` | host | AdGuard, Beszel Agent (Tailscale est sur l'host natif, pas Docker) |
