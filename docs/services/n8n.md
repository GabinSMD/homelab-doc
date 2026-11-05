# n8n (essai)

:::info[En essai depuis le 2026-11-05]
Outil d'automatisation à l'essai. À la fin de l'essai, soit il devient un vrai service (IaC, Alloy, SSO), soit il est retiré avec le guide [Retirer un service](../guides/retirer-service.md).
:::

| | |
|---|---|
| Accès | `https://n8n.home.gabin-simond.fr` (Authelia, puis le compte propriétaire de n8n) |
| Où | LXC 112 `n8n` sur galahad, `192.168.1.39` |
| Version | 2.46.6, épinglée par empreinte (mise à jour par Renovate) |
| Compose | `homelab-config/n8n/docker-compose.yml`, déployé dans `/opt/n8n` |
| Sauvegarde | job nocturne `vzdump` de galahad (toutes les LXC) |

## Pourquoi
Premier usage prévu : **un résumé quotidien des notifications mineures**, pour que ntfy ne pousse en direct que ce qui demande une action. C'est la phase 2 du ménage de la supervision.

## Choix de mise en place
- **Pare-feu** : le port 5678 n'est ouvert qu'à penny (Traefik). L'ouvrir au LAN contournerait Authelia.
- **Rien ne sort vers n8n.io** : télémétrie, annonces de version et modèles distants désactivés.
- **Historique d'exécution purgé à 14 jours**, mémoire plafonnée à 1 Go, journaux Docker limités à 3 × 10 Mo.
- **Accès à ntfy** : un compte ntfy dédié `n8n`, limité au sujet `homelab`, authentifié par jeton.

## À ne pas oublier
La **clé de chiffrement** de n8n (`/opt/n8n/data/config`) protège les identifiants enregistrés dans les workflows. Il faut la copier dans Vaultwarden : sans elle, une restauration rendrait ces identifiants illisibles.
