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

## La seule exception au socket-proxy

Tous les conteneurs passent par `socket-proxy` pour parler à l'API Docker. Portainer
est le **seul** à monter `/var/run/docker.sock` directement, en lecture seule —
parce qu'il a besoin d'endpoints que le proxy ne relaie pas.

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
