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

## Instances

| Instance | Machine | IP | Role |
|---|---|---|---|
| **Primaire** | RPi 4 (Docker, host network) | `192.168.1.28` | DNS principal, ad-blocking |
| **Secondaire** | LXC 100 "guardian" sur pve1 | `192.168.1.30` | DNS de secours, ad-blocking |

Les deux instances ont la meme configuration : memes upstream (Quad9 DoH), memes blocklists, memes `user_rules` conditionnelles.

### Synchronisation

Les configs sont synchronisees **manuellement**. Quand les `user_rules` ou les blocklists changent sur le primaire, reproduire sur le secondaire.

### Basculement DNS

Les clients recoivent les deux adresses DNS via DHCP :

- DNS 1 : `192.168.1.28` (RPi, primaire)
- DNS 2 : `192.168.1.30` (guardian LXC, secondaire)

Si le RPi tombe, les clients basculent sur le secondaire en quelques secondes. Le secondaire resout `*.home.gabin-simond.fr` vers le RPi — les services redeviennent accessibles des que le RPi reboote (watchdog ~15s + Docker ~30-60s).

!!! warning "Ne pas utiliser de DNS Rewrites statiques"
    Voir [DNS flow](../guides/dns-flow.md#les-dns-rewrites-la-piece-cle) — uniquement les `user_rules` conditionnelles sur les deux instances.

## LXC "guardian" — health check externe

Le meme LXC qui heberge AdGuard secondaire surveille le RPi depuis l'exterieur :

| Check | Methode | Seuil |
|---|---|---|
| Ping ICMP | `ping 192.168.1.28` | 3 min sans reponse |
| Traefik HTTP | `curl http://192.168.1.28:8080/ping` | idem |
| DNS | `dig @192.168.1.28 google.com` | info supplementaire |

Si le RPi ne repond plus apres 3 min → alerte ntfy urgente.
Si le RPi repond au ping mais Traefik est down → alerte ntfy haute.
Quand le RPi revient → notification "RECOVERED" avec duree du downtime.
