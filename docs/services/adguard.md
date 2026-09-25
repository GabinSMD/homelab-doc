# AdGuard Home

Résolveur DNS avec ad-blocking pour tout le réseau. **Pas de DHCP** : c'est la box qui
le distribue.

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
- Amont en **DNS-over-HTTPS** vers Cloudflare (voir plus bas)

Ce que la page annonçait et qui n'est **pas** le cas, vérifié le 2026-09-25 : ni
DNS-over-TLS servi sur 853 (`tls.enabled: false`), ni DHCP (`dhcp.enabled: false`).
Une fonction listée dans un « rôle » n'est pas une fonction activée.

## Ports

Relevé le 2026-09-25 dans `AdGuardHome.yaml` et par `ss -tulnp`.

| Port | Protocole | Usage | État réel |
|---|---|---|---|
| 53 | TCP/UDP | DNS standard | écoute |
| 3000 | TCP | Interface web | écoute |
| 853 | TCP | DNS-over-TLS | **rien n'écoute** — `tls.enabled: false` |
| 67 | UDP | DHCP | **rien n'écoute** — `dhcp.enabled: false` |

:::warning[Deux ports listés qui ne servent pas]
La page les donnait comme actifs. Le **853** a même une règle de pare-feu ouverte sur
penny alors qu'aucun service n'est derrière : un client configuré en DoT échouera, et la
règle se lira comme justifiée le jour où quelque chose se mettra à écouter. Le **67** est
inerte — c'est la box qui distribue le DHCP.
:::

## DNS upstream

| Rôle | Serveur |
|---|---|
| **Upstream** | `https://cloudflare-dns.com/dns-query` (DoH) |
| Bootstrap | `9.9.9.10`, `1.1.1.1` |

:::danger[Ce n'est pas Quad9 — corrigé le 2026-09-25]
Cette page annonçait Quad9 (`9.9.9.9` / `149.112.112.112`) comme résolveurs amont. C'est
faux : l'amont est **Cloudflare en DNS-over-HTTPS**. Quad9 n'apparaît que comme
*bootstrap* — uniquement pour résoudre le nom du résolveur DoH au démarrage, pas pour les
requêtes courantes.

L'écart n'est pas cosmétique : cette ligne dit **à qui part l'intégralité du trafic DNS
de la maison**. Se tromper de nom, c'est se tromper sur le destinataire des données.
:::

## Stockage

- **Config** : bind mount `/mnt/ssd/config/adguard/adguard-prod-1/` → `/opt/adguardhome/conf`
  (le sous-répertoire compte : `adguard/` porte aussi la config du secondaire)
- **Données** : Docker volume `adguard-data` → `/opt/adguardhome/work`

## Instances

| Instance | Machine | IP | Rôle |
|---|---|---|---|
| **Primaire** | RPi 4 (Docker, host network) | `192.168.1.28` | DNS principal, ad-blocking |
| **Secondaire** | LXC 100 "dns-failover" sur galahad | `192.168.1.30` | DNS de secours, ad-blocking |

Les deux instances ont la même configuration : même upstream (**Cloudflare DoH**), mêmes blocklists, mêmes `user_rules` conditionnelles.

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

:::warning[Ne pas utiliser de DNS Rewrites statiques pour `*.home.*`]
Voir [DNS flow](../architecture/reseau.mdx#les-dns-rewrites-la-pièce-clé) — uniquement les `user_rules` conditionnelles sur les deux instances.
:::

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
| Traefik HTTPS | `curl -sfk --max-time 5 https://192.168.1.28` | idem |
| DNS | `dig @192.168.1.28 google.com` | info supplémentaire |

:::warning[Le `/ping` de Traefik n'est pas joignable de l'extérieur]
Cette page annonçait `curl http://192.168.1.28:8080/ping`. Ça ne peut pas
fonctionner : Traefik ne publie que **80 et 443**, son `/ping` sur 8080 reste
interne au conteneur — c'est son propre healthcheck Docker qui l'utilise, en
`localhost`.

La sonde réelle du LXC 100 (`/root/rpi_watchdog.sh`, une fois par minute) est
`curl -sfk --max-time 5 https://192.168.1.28`. Le `-k` est nécessaire : le
certificat ne couvre pas une IP nue. Corrigé le 2026-08-26, après avoir lu le
script plutôt que la page.
:::


Si le RPi ne répond plus après 3 min → alerte ntfy urgente.
Si le RPi répond au ping mais Traefik est down → alerte ntfy haute.
Quand le RPi revient → notification "RECOVERED" avec durée du downtime.
