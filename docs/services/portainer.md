# Portainer

Interface d'administration Docker. Pratique pour inspecter, mauvaise idée pour
déployer : la source de vérité des conteneurs de penny reste
`/mnt/ssd/config/docker/docker-compose.yml`.

| | |
|---|---|
| Image | `portainer/portainer-ee:latest` |
| URL | `portainer.home.gabin-simond.fr` |
| Auth | OIDC Authelia, connexion automatique, formulaire interne masqué |
| Limite mémoire | 256 Mo |

## Les exceptions au socket-proxy {#la-seule-exception-au-socket-proxy}

Presque tous les conteneurs passent par `socket-proxy` pour parler à l'API Docker.
Portainer monte `/var/run/docker.sock` directement, parce qu'il a besoin d'endpoints que
le proxy ne relaie pas.

:::note[Il n'est pas le seul — corrigé le 2026-09-24]
Cette page affirmait « le seul ». Le relevé en donne **deux** : `portainer` et
`beszel-agent`, qui lit les métriques par conteneur. Les deux montent en `ro`.

Et `ro` protège moins qu'il n'en a l'air : le drapeau porte sur le **nœud de système de
fichiers**, pas sur ce qu'on envoie dans la socket. Un processus qui peut ouvrir cette
socket peut émettre n'importe quel appel de l'API Docker, y compris créer un conteneur
privilégié. `ro` n'est pas une réduction de privilège — c'est l'accès lui-même qui est le
privilège.
:::

:::warning[C'est la surface d'attaque la plus large du homelab]
Un accès à Portainer est un accès à l'API Docker, donc à l'hôte. C'est la raison
pour laquelle le formulaire de connexion interne est masqué et l'accès passe
uniquement par Authelia. Toute régression sur ce point est une élévation de
privilèges — elle s'est déjà produite deux fois, en mai puis en juin 2026.
:::

Le healthcheck utilise un `busybox` monté depuis l'hôte : l'image est distroless,
elle n'a ni `wget` ni `curl`.

## Utiliser Portainer sans se tirer dessus

À faire : lire les logs, inspecter un réseau, voir l'usage disque d'un volume,
redémarrer un conteneur en dépannage.

À ne pas faire : créer un conteneur, éditer une stack, changer un réseau. Rien de
tout ça n'est versionné, et le prochain `docker compose up -d` l'écrase sans
prévenir.
