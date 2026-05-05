# AdGuard Home

DNS et DHCP avec ad-blocking pour tout le réseau.

## Acces

| | |
|---|---|
| URL | `https://dns.home.gabin-simond.fr` (primaire) / `https://dns-failover.home.gabin-simond.fr` (secondaire) |
| Host | penny (Docker, host network) + LXC 100 dns-failover (galahad) |
| Image | `adguard/adguardhome:latest` |
| Auth | ForwardAuth Authelia + bcrypt local |

## Rôle

- **DNS resolver** principal pour le réseau local
- **Ad-blocking** au niveau DNS (listes de blocage)
- **DNS-over-TLS** sur le port 853
- **DHCP** (optionnel, peut être géré par OPNsense a terme)

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
- **Données** : Docker volume `adguard-data` → `/opt/adguardhome/work`

## Instances

| Instance | Machine | IP | Rôle |
|---|---|---|---|
| **Primaire** | RPi 4 (Docker, host network) | `192.168.1.28` | DNS principal, ad-blocking |
| **Secondaire** | LXC 100 "dns-failover" sur galahad | `192.168.1.30` | DNS de secours, ad-blocking |

Les deux instances ont la même configuration : mêmes upstream (Quad9 DoH), mêmes blocklists, mêmes `user_rules` conditionnelles.

### Synchronisation

Les configs sont synchronisees **manuellement**. Quand les `user_rules` ou les blocklists changent sur le primaire, reproduire sur le secondaire.

### Basculement DNS

Les clients recoivent les deux adresses DNS via DHCP :

- DNS 1 : `192.168.1.28` (RPi, primaire)
- DNS 2 : `192.168.1.30` (dns-failover LXC, secondaire)

Si le RPi tombe, les clients basculent sur le secondaire en quelques secondes. Le secondaire resout `*.home.gabin-simond.fr` vers le RPi — les services redeviennent accessibles des que le RPi reboote (watchdog ~15s + Docker ~30-60s).

### Acces Tailscale (clients distants)

Le LXC dns-failover a **Tailscale installe** (IP : `100.74.145.26`). Les clients VPN distants peuvent utiliser ce DNS secondaire.

Configuration Tailscale admin (login.tailscale.com > DNS) :

- DNS 1 : `100.97.239.90` (RPi)
- DNS 2 : `100.74.145.26` (dns-failover)

!!! warning "Ne pas utiliser de DNS Rewrites statiques pour `*.home.*`"
    Voir [DNS flow](../architecture/reseau.md#les-dns-rewrites-la-piece-cle) — uniquement les `user_rules` conditionnelles sur les deux instances.

### DNS Rewrites statiques (exceptions)

La seule rewrite statique conservee est pour le switch manageable, qui n'est pas derriere Traefik :

| Domaine | IP | Raison |
|---|---|---|
| `switch.lan` | `192.168.1.2` | HTTP only, hors scope HSTS `home.gabin-simond.fr` |

Le domaine `switch.lan` (sans `.home.gabin-simond.fr`) évite le HSTS `includeSubdomains` qui forcerait HTTPS sur un équipement qui ne le supporte pas. Acceder via `http://switch.lan` ou directement `http://192.168.1.2`.

## LXC "dns-failover" — health check externe

Le même LXC qui heberge AdGuard secondaire surveillé le RPi depuis l'extérieur :

| Check | Méthode | Seuil |
|---|---|---|
| Ping ICMP | `ping 192.168.1.28` | 3 min sans réponse |
| Traefik HTTP | `curl http://192.168.1.28:8080/ping` | idem |
| DNS | `dig @192.168.1.28 google.com` | info supplémentaire |

Si le RPi ne répond plus après 3 min → alerte ntfy urgente.
Si le RPi répond au ping mais Traefik est down → alerte ntfy haute.
Quand le RPi revient → notification "RECOVERED" avec durée du downtime.
