# Comment fonctionne le DNS

Explication du flow DNS complet, du navigateur jusqu'au service.

## Architecture DNS

```mermaid
graph TB
    subgraph "Reseau local"
        Client[Client LAN<br/>192.168.1.x] -->|requete DNS| AG[AdGuard Home<br/>192.168.1.28:53]
        AG -->|rewrite local| Client
    end
    
    subgraph "Tailscale"
        TSClient[Client VPN<br/>100.x.x.x] -->|requete DNS| AG
        AG -->|rewrite Tailscale IP| TSClient
    end
    
    subgraph "Internet"
        AG -->|upstream DoH| Quad9[Quad9<br/>dns10.quad9.net]
    end
    
    subgraph "RPi 4"
        AG
        Traefik -->|forward| Service[Container]
    end
    
    Client -->|HTTPS| Traefik
    TSClient -->|HTTPS via Tailscale| Traefik
```

## Les DNS rewrites (la piece cle)

AdGuard Home utilise des **regles de reecritures conditionnelles** dans `user_rules` pour rediriger les domaines internes vers le RPi **sans passer par Internet** :

```
||home.gabin-simond.fr^$dnsrewrite=192.168.1.28,client=192.168.1.0/24
||home.gabin-simond.fr^$dnsrewrite=192.168.1.28,client=172.16.0.0/12
||home.gabin-simond.fr^$dnsrewrite=100.97.239.90,client=100.64.0.0/10
```

### Que font ces regles ?

| Regle | Client vu par AdGuard | Reponse DNS | Pourquoi |
|---|---|---|---|
| 1ere | LAN direct (`192.168.1.0/24`) | `192.168.1.28` | Client LAN utilisant l'IP RPi comme DNS |
| 2eme | Docker bridge (`172.16.0.0/12`) | `192.168.1.28` | Tous les clients passant par le bridge Docker |
| 3eme | Tailscale direct (`100.64.0.0/10`) | `100.97.239.90` | Futur : si AdGuard tourne hors Docker |

!!! warning "Subtilite importante : AdGuard en container Docker"
    AdGuard tourne en **container Docker**. Toutes les requetes DNS (LAN et Tailscale) transitent par le bridge Docker et arrivent a AdGuard avec l'IP source `172.20.0.1` — **pas** l'IP reelle du client.

    C'est pourquoi la regle `client=172.16.0.0/12` est indispensable : elle couvre le cas reel ou AdGuard voit le bridge Docker comme client. La regle Tailscale `100.64.0.0/10` est la en prevision d'un futur deploiement hors Docker (LXC Proxmox par ex.).

### Wildcard `home.gabin-simond.fr`

La regle utilise `||home.gabin-simond.fr^` — c'est un **wildcard**. Ca matche :

- `home.gabin-simond.fr`
- `traefik.home.gabin-simond.fr`
- `adguard.home.gabin-simond.fr`
- `monservice.home.gabin-simond.fr`
- ... tout sous-domaine de `home.gabin-simond.fr`

**Resultat : pas besoin d'ajouter une regle DNS par service.** Tout nouveau service avec un sous-domaine `*.home.gabin-simond.fr` est automatiquement redirige.

## Flow complet d'une requete

=== "Depuis le LAN"

    ```
    1. Navigateur → adguard.home.gabin-simond.fr ?
    2. AdGuard → rewrite → 192.168.1.28 (regle client=192.168.1.0/24)
    3. Navigateur → HTTPS 192.168.1.28:443
    4. Traefik → match Host header → forward vers container adguard:3000
    5. Reponse ← chiffree TLS (certificat Let's Encrypt)
    ```

=== "Depuis Tailscale (distant)"

    ```
    1. Navigateur → adguard.home.gabin-simond.fr ?
    2. DNS → resolution publique ou AdGuard via Tailscale
    3. Navigateur → HTTPS 100.97.239.90:443 (via tunnel Tailscale)
    4. Traefik → match Host header → forward vers container adguard:3000
    5. Reponse ← chiffree TLS
    ```

## DNS upstream

Pour les domaines **non locaux** (tout sauf `*.home.gabin-simond.fr`), AdGuard forward vers :

| Upstream | Protocole | Adresse |
|---|---|---|
| Quad9 | DNS-over-HTTPS | `https://dns10.quad9.net/dns-query` |

Bootstrap DNS (pour resoudre `dns10.quad9.net` lui-meme) :

- `9.9.9.10`
- `149.112.112.10`

Mode : **load balance** entre les upstreams.

## TLS / Certificats

```mermaid
sequenceDiagram
    participant TF as Traefik
    participant LE as Let's Encrypt
    participant CF as Cloudflare

    Note over TF: Nouveau domaine detecte<br/>(label Docker)
    TF->>LE: Demande certificat pour<br/>monservice.home.gabin-simond.fr
    LE->>CF: Cree record TXT<br/>_acme-challenge.monservice.home...
    CF-->>LE: OK, record present
    LE-->>TF: Certificat delivre
    Note over TF: Certificat stocke dans<br/>/certs/acme.json
    Note over TF: Renouvellement auto<br/>avant expiration
```

**Pourquoi le DNS challenge ?**

- Pas besoin d'exposer le port 80 sur Internet
- Fonctionne pour des domaines internes (pas accessibles depuis Internet)
- Cloudflare gere la zone DNS `gabin-simond.fr`
- Traefik utilise le token API Cloudflare (`CF_DNS_API_TOKEN`) pour creer/supprimer les records TXT automatiquement
