# ntfy — notifications

Toutes les alertes du homelab arrivent ici : `homelab_monitor.sh`, les règles
Grafana, les webhooks PVE et PBS, les sondes de fraîcheur. C'est l'unique canal.

| | |
|---|---|
| Image | `binwiederhier/ntfy:latest` |
| URL interne | `ntfy.home.gabin-simond.fr` |
| URL publique | `https://penny.tail8850a4.ts.net` (Tailscale Funnel) |
| Écoute | `127.0.0.1:8090` uniquement |
| Config | `/mnt/ssd/config/ntfy/server.yml` |
| Topic | `homelab`, `auth-default-access: deny-all`, jeton obligatoire |

## Pourquoi deux URL

C'est le seul service **publiquement** exposé du homelab, et c'est une contrainte,
pas un choix : **les notifications push iOS exigent une URL publique.** Le Funnel
Tailscale sert exactement ça, et rien d'autre ne passe par là.

:::danger[`base-url` doit égaler le « Default Server » de l'app]
Si les deux diffèrent, l'app iOS s'abonne à un serveur et reçoit des messages
signés d'un autre : les notifications n'arrivent jamais, sans erreur visible.
Le Funnel refuse par ailleurs tout domaine personnel — c'est `penny.ts.net` ou
rien.
:::

## Pour un script qui doit notifier

Toujours `127.0.0.1:8090`, jamais le nom de domaine :

```bash
curl -s -H "Authorization: Bearer $NTFY_TOKEN" \
     -H "Title: Sujet" -H "Priority: high" -H "Tags: warning" \
     -d "Le corps du message" \
     http://127.0.0.1:8090/homelab
```

L'adresse locale évite trois dépendances d'un coup : la résolution DNS AdGuard,
Traefik, et le certificat TLS. Une alerte doit pouvoir partir **pendant** la panne
qu'elle signale.

:::warning[Les en-têtes sont en latin-1 strict]
`Title`, `Tags` et `Priority` passent par des en-têtes HTTP. Un caractère
non-latin-1 fait échouer la requête. C'est la raison d'être du relais
`ntfy-relay` (LXC 101), un sidecar Python qui reformate le JSON d'Alertmanager en
en-têtes ntfy — Grafana 12 n'a pas de type de contact ntfy natif.
:::

## Diagnostiquer un flot de notifications

Interroger l'API **avant** de couper quoi que ce soit : le cache retient 24 h et
permet de compter par titre plutôt que de deviner.

```bash
curl -s -H "Authorization: Bearer $NTFY_TOKEN" \
     "http://127.0.0.1:8090/homelab/json?poll=1&since=24h" \
  | jq -r '.title' | sort | uniq -c | sort -rn
```

Sans jeton sous la main, la base de cache donne la même chose :

```bash
cp /mnt/ssd/docker/volumes/config_ntfy-data/_data/cache.db /tmp/c.db
sqlite3 /tmp/c.db "SELECT count(*) n, title FROM messages GROUP BY title ORDER BY n DESC;"
```

C'est cette requête qui a montré, le 2026-08-26, qu'une seule règle Grafana
orpheline produisait **60 % du trafic du topic** — voir
[règle orpheline](../operations/incidents-recurrents.md#regle-grafana-orpheline-apres-retrait-dun-service).

## Le point aveugle

ntfy tourne **dans le stack qu'il surveille**. Quand le stack tombe, la livraison
tombe avec lui : 57 minutes de silence le 2026-08-06. Le contournement est un
basculement vers Healthchecks (`/fail`) quand la livraison locale échoue — un
canal qui ne partage pas le destin de ce qu'il annonce.

## Surveiller le chemin public (`funnel-public-check`)

Timer horaire sur penny depuis le **2026-09-21**. Il ferme un angle mort qui s'était
ouvert trois fois pour trois causes différentes.

L'iPhone reçoit ses notifications **en deux temps** :

1. ntfy publie une demande de réveil vers `ntfy.sh` — **en sortant**. Ne passe pas par le
   Funnel, marche même si l'ingress est mort.
2. le téléphone vient **chercher** le contenu sur `https://penny.<tailnet>.ts.net`, donc
   par l'anycast public de Tailscale.

Quand l'étape 2 casse, l'utilisateur voit « New message » sans contenu — le symptôme
détaillé dans [ntfy iOS n'affiche que « New message »](../operations/incidents-recurrents.md#ntfy-new-message).
Rien ne le signalait : on l'apprenait en n'arrivant plus à lire une notification. Trois
occurrences, trois causes : fetch anonyme (05/08), NXDOMAIN public (01/09), ingress
décroché (21/09) — et à chaque fois **le canal d'alerte lui-même était la victime**.

### Deux particularités qui changent la conception

**Le Funnel est en anycast.** Le nom rend plusieurs A et le téléphone en tire un au sort.
Le 21/09, `.63` et `.145` rendaient 200 pendant que `.46` échouait systématiquement :
panne **partielle**, chez Tailscale. La sonde teste donc **toutes** les adresses et
n'alerte que si **elles échouent toutes**. Une panne partielle est journalisée, pas
notifiée : elle dégrade sans empêcher, et le bruit quotidien est ce qui tue un canal
d'alerte.

**Il faut résoudre par un résolveur public** (`1.1.1.1` par défaut). En local, MagicDNS
rend l'adresse du tailnet et on mesurerait le chemin interne — qui marche toujours. Deux
diagnostics ont déjà été invalidés par cette erreur.

### Ce qu'est une réponse saine

`200`, `401` et `403` valent tous **succès** : la requête a traversé le Funnel et ntfy a
répondu. Le `403` (code `40301`) est même la réponse **normale** à une sonde sans
identifiants. L'échec, c'est `000` — TLS ou TCP mort avant toute réponse.

:::note[Limite assumée]
Si le Funnel est totalement mort, la notification que cette sonde envoie arrivera elle
aussi en « New message » illisible. C'est inévitable : ce canal **est** l'objet surveillé.
Elle reste utile pour deux raisons — la bannière seule est déjà un signal (tu sais
désormais ce qu'elle veut dire), et le journal donne la cause immédiatement au lieu d'une
heure d'enquête.
:::
