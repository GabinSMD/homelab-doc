# Beszel — métriques d'hôtes

Supervision légère des trois machines : CPU, RAM, disque, température, conteneurs.
Complémentaire de Grafana, qui porte les logs.

| | |
|---|---|
| Image | `henrygd/beszel:latest` + `beszel-agent` |
| URL | `monitor.home.gabin-simond.fr` |
| Auth | OIDC Authelia (`one_factor`) — mot de passe local désactivé |
| Agent | réseau `host`, port 45876 |
| Socket | `/mnt/ssd/data/beszel/beszel_socket` |
| Limite mémoire | 128 Mo |

L'agent est en réseau `host` parce qu'il doit voir les interfaces et les disques
réels, pas ceux d'un bridge Docker.

## La régression qui revient

:::danger[PocketBase remet `meta.appURL` à zéro à chaque redémarrage]
Symptôme : **page blanche** après le flux d'authentification Authelia. Le
conteneur est `running` et son healthcheck est vert — l'état de santé Docker ne
sert donc à rien ici.

Correctif idempotent, sans perte de données :

```bash
docker exec beszel sqlite3 /pb_data/data.db \
  "UPDATE _params SET value='https://monitor.home.gabin-simond.fr' WHERE key='meta.appURL';"
docker compose restart beszel
```
:::

Quatre invariants à garder en tête, parce que chacun a déjà cassé l'OIDC :
`meta.appURL` doit être l'URL publique complète en HTTPS ; le client OIDC doit
exister côté Authelia avec la bonne méthode d'authentification ; le conteneur doit
résoudre `auth.home…` (d'où le `dns: 192.168.1.28`) ; et le mot de passe local
reste désactivé, sinon on a deux chemins d'authentification à sécuriser.

## Ce que Beszel ne couvre pas

Il mesure des hôtes. Il ne détecte ni une sauvegarde muette, ni une dérive de
configuration, ni un service qui répond 200 en servant du vide. Ces angles-là sont
couverts par [`homelab_monitor.sh`](../operations/monitoring.md) et les règles
Grafana en espace négatif.
