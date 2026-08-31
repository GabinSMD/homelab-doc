# Boîte à outils

Quatre utilitaires web sans état, plus une page d'état statique. Tous derrière
Authelia, tous en `cap_drop: ALL`, plusieurs en `read_only`.

| Service | URL | Image | Mémoire | À quoi ça sert |
|---|---|---|---|---|
| **CyberChef** | `cyberchef.home…` | `ghcr.io/gchq/cyberchef` | 64 Mo | Encodages, hachages, décodage de jetons — sans rien envoyer à un site tiers |
| **Stirling PDF** | `pdf.home…` | `s-pdf:latest-ultra-lite` | 768 Mo | Manipulation de PDF en local, locale `fr_FR` |
| **Dozzle** | `dozzle.home…` | `amir20/dozzle` | 128 Mo | Logs des conteneurs en direct, via `socket-proxy` |
| **status** | — | `busybox:1.38` | 16 Mo | Page d'état statique servie depuis `/mnt/ssd/status` |

## Pourquoi ces choix

L'intérêt de CyberChef et Stirling PDF auto-hébergés est exactement le même :
**ne pas déposer un jeton, un contrat ou une facture sur un service tiers** pour
une manipulation de trente secondes.

Dozzle lit l'API Docker par `socket-proxy`, jamais le socket en direct, et il est
`read_only`. Son `DOZZLE_AUTH_PROVIDER: none` est volontaire : l'authentification
est déléguée à Authelia en amont, pas dupliquée dans l'application.

`status` est un `busybox httpd` de 16 Mo qui sert des fichiers statiques. C'est le
plus petit conteneur du homelab et il n'a aucune dépendance.

## Mesurer l'utilité avant de trancher

:::warning[Le trafic Traefik ne mesure pas l'outillage]
Un outil consulté trois fois par mois n'est pas inutile — il est là pour le jour
où on en a besoin. Le trafic mesure un service, pas une boîte à outils. Ne pas
juger cette page sur des compteurs d'accès.

Un cas concret : CyberChef est resté **mort 24 heures sans alerte** parce que la
sonde interrogeait Traefik, qui répondait 302 vers Authelia — un 302 vient du
middleware, pas du backend. Sonder depuis Traefik, ou ne pas sonder du tout.
:::
