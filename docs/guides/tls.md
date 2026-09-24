# TLS et certificats

Comment fonctionne le HTTPS automatique sur tous les services internes.

## Vue d'ensemble

Tous les services internes sont accessibles en **HTTPS avec un certificat Let's Encrypt valide**, même s'ils ne sont pas exposes sur Internet.

La magie repose sur le **DNS challenge Cloudflare** :

1. Traefik détecté un nouveau service (via les labels Docker)
2. Il demande un certificat a Let's Encrypt
3. Let's Encrypt vérifie la propriete du domaine en demandant un record TXT DNS
4. Traefik créé automatiquement ce record via l'API Cloudflare
5. Certificat delivre, stocké, renouvele automatiquement

## Pourquoi le DNS challenge ?

| Méthode | HTTP challenge | DNS challenge |
|---|---|---|
| Port 80 exposé sur Internet | **Oui** (obligatoire) | Non |
| Fonctionne pour des domaines internes | Non | **Oui** |
| Wildcard possible | Non | **Oui** |
| Config supplémentaire | Aucune | Token API Cloudflare |

Pour un homelab avec des services internes, le DNS challenge est **la seule option viable**.

## Configuration Traefik

### traefik.yml

```yaml
certificatesResolvers:
  letencrypt:                          # sans le « s », c'est le nom declare
    acme:
      email: acme@gabin-simond.fr
      storage: /certs/acme.json
      caServer: https://acme-v02.api.letsencrypt.org/directory
      dnsChallenge:
        provider: cloudflare
        resolvers:                     # OBLIGATOIRE, voir ci-dessous
          - "1.1.1.1:53"
          - "9.9.9.9:53"
        propagation:
          delayBeforeChecks: 30s
```

:::danger[Sans `resolvers`, le joker AdGuard avale `_acme-challenge` et TOUT échoue]
C'est la panne la plus coûteuse qu'ait connue ce homelab côté TLS, et elle est
**entièrement silencieuse**.

Sans cette liste, `lego` vérifie la propagation du défi via le résolveur du conteneur :
Docker (`127.0.0.11`) puis AdGuard. Or AdGuard porte une réécriture **joker**
`*.home.gabin-simond.fr → 192.168.1.28`, qui capture aussi
`_acme-challenge.<service>.home.gabin-simond.fr`. La requête A répond `192.168.1.28`,
et la requête TXT ne répond **rien**.

L'enregistrement est pourtant bien publié chez Cloudflare. C'est la **vérification** qui
est aveugle, jamais l'émission — d'où l'absence de tout signal.

Constaté le **2026-08-15** : tous les renouvellements échouaient depuis un moment.
`pulse` était expiré depuis 4 jours **et servait quand même**, et 20 autres certificats
tombaient le 07/09. Interroger des résolveurs publics contourne AdGuard pour ce seul
usage, sans toucher au joker, qui lui est voulu.

`delayBeforeChecks: 30s` répond à la suite : résolveurs corrigés, l'émission redevenait
possible mais restait **intermittente**. Une vingtaine de renouvellements en retard se
déclenchent ensemble et `lego` vérifie plus vite que Cloudflare ne propage. Les 30 s
absorbent l'écart.
:::

:::warning[Rien ne surveille l'échéance des certificats]
Le corollaire : c'est une expiration **servie en silence** qui a révélé la panne, pas une
alerte. Un certificat expiré ne fait pas tomber Traefik — il sert simplement un
certificat que le navigateur refuse. Piste ouverte.
:::

### Variables d'environnement

```yaml
environment:
  - CF_API_EMAIL=${CF_API_EMAIL}        # Email du compte Cloudflare
  - CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}  # Token API (pas la Global API Key)
```

:::tip[Token API vs Global API Key]
Utilisé un **API Token** avec uniquement la permission `Zone:DNS:Edit` sur ta zone, pas la Global API Key. Principe de moindre privilege.
:::

### Labels Docker (par service)

```yaml
labels:
  - "traefik.http.routers.SERVICE.tls=true"
  - "traefik.http.routers.SERVICE.tls.certresolver=letencrypt"
```

## Stockage des certificats

Les certificats sont stockes dans le volume Docker `traefik-certs` au fichier `/certs/acme.json`.

- Renouvellement automatique avant expiration (30 jours avant)
- Un seul fichier JSON contient tous les certificats
- Si le fichier est perdu, Traefik re-demande tous les certificats au prochain démarrage

:::warning[Rate limits Let's Encrypt]
Let's Encrypt a des limités : 50 certificats par domaine par semaine. Pour tester, utiliser le serveur **staging** :
```yaml
caServer: https://acme-staging-v02.api.letsencrypt.org/directory
```
:::

## Entrypoints et redirection HTTP → HTTPS

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"
```

Tout le trafic HTTP (port 80) est **automatiquement redirige** vers HTTPS (port 443). Aucun service n'est accessible en clair.

## Vérifier un certificat

```bash
# Verifier le certificat d'un service
echo | openssl s_client -connect 192.168.1.28:443 -servername monservice.home.gabin-simond.fr 2>/dev/null | openssl x509 -noout -dates -subject

# Via curl
curl -vI https://monservice.home.gabin-simond.fr 2>&1 | grep -E "subject|expire|issuer"
```
