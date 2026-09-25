# CrowdSec

Détection comportementale sur les logs Traefik, avec un bouncer qui bloque au
niveau du reverse proxy.

| | |
|---|---|
| Image | `crowdsecurity/crowdsec:latest` |
| LAPI | `192.168.1.28:6060` |
| Collections | **six**, voir ci-dessous |
| Logs lus | `traefik-data:/var/log/traefik:ro` |
| Limite mémoire | 256 Mo |

Relevé le 2026-09-25 par `cscli collections list` — la page n'en listait que trois :

| Collection | Ce qu'elle couvre |
|---|---|
| `crowdsecurity/traefik` | parser Traefik + scénarios HTTP génériques |
| `crowdsecurity/http-cve` | exploitation de CVE dans les logs HTTP |
| `crowdsecurity/base-http-scenarios` | détection de scanners |
| `crowdsecurity/sshd` | parser sshd + **brute-force SSH** |
| `crowdsecurity/linux` | socle syslog + geoip + ssh |
| `crowdsecurity/whitelist-good-actors` | liste blanche des acteurs légitimes |

Le bouncer est un middleware Traefik : une IP bannie est refusée avant d'atteindre
Authelia, donc avant tout traitement applicatif.

:::note[`cscli bouncers list` accumule des inscriptions fantômes]
Au 2026-09-25 il en affiche **cinq** alors qu'un seul travaille. Chaque recréation du
conteneur Traefik lui donne une nouvelle IP sur le réseau `proxy`, et le plugin
s'enregistre sous `traefik-plugin@<nouvelle-ip>` sans que l'ancienne entrée disparaisse.

Les cinq sont marquées `✔️ Valid`, ce qui ne dit donc **rien** de l'état réel. La colonne
qui compte est `Last API pull` : l'une d'elles datait du 2026-08-22, soit plus d'un mois.

```bash
docker exec crowdsec cscli bouncers list    # lire Last API pull, pas Valid
```

Ne jamais conclure « le bouncer tourne » parce que la liste n'est pas vide. C'est le
même piège que partout ailleurs ici : la présence d'une entrée n'est pas la preuve d'un
travail accompli.
:::

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
