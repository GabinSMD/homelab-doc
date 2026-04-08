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
||home.gabin-simond.fr^$dnsrewrite=100.97.239.90,client=172.20.0.1
||home.gabin-simond.fr^$dnsrewrite=100.97.239.90,client=172.0.0.0/8
```

### Que font ces regles ?

| Regle | Client source | Reponse DNS | Pourquoi |
|---|---|---|---|
| 1ere | LAN (`192.168.1.0/24`) | `192.168.1.28` (IP locale RPi) | Acces direct via le LAN |
| 2eme | Docker bridge (`172.20.0.1`) | `100.97.239.90` (IP Tailscale) | Containers qui font des requetes DNS |
| 3eme | Docker/Tailscale (`172.0.0.0/8`) | `100.97.239.90` (IP Tailscale) | Autres reseaux Docker internes |

!!! info "Pourquoi pas la meme IP pour tous ?"
    Les containers Docker et les clients Tailscale ne peuvent pas joindre `192.168.1.28` directement dans tous les cas. L'IP Tailscale (`100.97.239.90`) est routable depuis partout (LAN, Docker, VPN).

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
