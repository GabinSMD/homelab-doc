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
