# CrowdSec

Détection comportementale sur les logs Traefik, avec un bouncer qui bloque au
niveau du reverse proxy.

| | |
|---|---|
| Image | `crowdsecurity/crowdsec:latest` |
| LAPI | `192.168.1.28:6060` |
| Collections | `traefik`, `http-cve`, `base-http-scenarios` |
| Logs lus | `traefik-data:/var/log/traefik:ro` |
| Limite mémoire | 256 Mo |

Le bouncer est un middleware Traefik : une IP bannie est refusée avant d'atteindre
Authelia, donc avant tout traitement applicatif.

## Le piège qui coûte un après-midi

:::danger[`CUSTOM_HOSTNAME: localhost` n'est pas décoratif]
Sans cette variable, l'entrypoint de l'image **régénère les identifiants LAPI à
chaque démarrage** en se basant sur le hostname du conteneur. Le résultat est une
boucle de redémarrage avec `authenticate watcher` en boucle dans les logs.

Le correctif durable est cette variable d'environnement, pas la suppression
manuelle des fichiers de credentials : sans elle, le problème revient au
redémarrage suivant. Commit `3a5ce94`.
:::

Les deux fichiers d'identifiants sont montés depuis `/run/homelab/crowdsec/` —
donc sur tmpfs, matérialisés par sops au démarrage. C'est volontaire : ils ne
doivent pas survivre à un redémarrage en clair sur disque.

## Vérifier

```bash
docker exec crowdsec cscli metrics          # flux lus, scenarios declenches
docker exec crowdsec cscli decisions list   # bans en cours
docker exec crowdsec cscli alerts list      # historique
```

Si `cscli` répond mais que rien n'est jamais banni, vérifier que le bouncer est
bien déclaré côté Traefik — un CrowdSec qui détecte sans bouncer ne bloque rien.
