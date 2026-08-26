# Stack logs — LXC 101

La pile d'observabilité complète, isolée dans son propre conteneur Proxmox sur
lancelot. C'est le domicile de Grafana, mais aussi de Loki, Prometheus et du
relais ntfy — qui n'avaient pas de page jusqu'ici.

| | |
|---|---|
| LXC | 101 `logs`, sur **lancelot** |
| IP | `192.168.1.31` |
| Compose | `/opt/logs/docker-compose.yml` |
| Composants | Loki, Grafana, Prometheus, `ntfy-relay`, Alloy |
| URL | `logs.home.gabin-simond.fr` → [Grafana](grafana.md) |

## Ce n'est pas un clone git

:::danger[`/opt/logs` est une copie déployée, pas un dépôt]
`git` n'est pas installé dans la LXC. La configuration est versionnée sous `logs/`
dans `homelab-config` et poussée par **`logs/deploy-to-lxc101.sh`**. Tout patch
appliqué directement dans `/opt/logs` est une dérive silencieuse — c'est comme ça
qu'un `loki-config.yml` a vécu en production sans être versionné jusqu'au
2026-06-25.

L'ordre correct est : éditer le dépôt, puis lancer le script. Pas l'inverse.
:::

Le script pousse la config, redémarre Grafana, **et vérifie qu'aucune règle
d'alerte n'est orpheline** — voir
[retirer une règle d'alerte](grafana.md#retirer-une-règle-dalerte).

## Le point aveugle structurel

:::warning[L'alerting tourne sur la machine qu'il surveille]
Grafana, Loki et le relais ntfy vivent sur lancelot. **Si lancelot tombe, c'est
l'outil de détection qui tombe avec.** Un nœud est resté hard-down onze jours sans
que rien ne le signale, précisément pour cette raison.

Deux contrepoids existent : un **réplica Loki sur penny** (`loki-replica`,
`192.168.1.28:3101`), vers lequel Alloy expédie en parallèle depuis galahad et
lancelot — il a sauvé les logs pendant l'incident — et des règles de type
dead-man-switch qui alertent sur le **silence** d'un hôte plutôt que sur ses
erreurs.
:::

## Déployer une modification

```bash
logs/deploy-to-lxc101.sh --dry-run   # montre ce qui serait pousse
logs/deploy-to-lxc101.sh             # pousse, applique, controle les orphelines
```

Le déploiement ne touche jamais les données runtime (`grafana/`, `loki/`,
`prometheus-data/`, `.env`). Les dashboards se rechargent seuls toutes les 60
secondes ; les règles d'alerte, elles, exigent un redémarrage de Grafana.
