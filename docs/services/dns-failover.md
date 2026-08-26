# AdGuard secondaire — LXC 100

Le deuxième résolveur DNS. Sans lui, AdGuard sur penny est un point de défaillance
unique : quand le stack Docker tombe, **plus rien ne résout**, et les LXC perdent
le DNS avant qu'on ait compris pourquoi.

| | |
|---|---|
| LXC | 100 `dns-failover`, sur **galahad** |
| IP | `192.168.1.30` — Tailscale `guardian` (`100.74.145.26`) |
| URL | `dns-failover.home.gabin-simond.fr` |
| Rôle | AdGuard secondaire + sonde de santé sur penny |
| Installation | **binaire natif**, pas Docker |

C'est le **résolveur n° 2 distribué au tailnet**, derrière penny. Un appareil
distant qui perd le premier bascule dessus sans rien faire.

## Le piège de la synchronisation

:::danger[`adguard-sync` recopie la configuration entière, schéma inclus]
Le primaire tourne en **Docker sur `latest`**, le secondaire en **binaire natif**.
Quand les deux versions divergent, la synchro pousse un fichier de configuration
au schéma trop récent, et le secondaire part en **boucle de crash**.

Un garde-fou de comparaison de versions a été ajouté (PR #38). La récupération, si
ça arrive quand même, passe par une installation manuelle du binaire à la bonne
version — pas par un rollback de la config, qui sera réécrasée à la synchro
suivante.
:::

## Le symptôme trompeur

Une alerte « coffre de sauvegarde périmé » ou « vault stale » est très souvent le
symptôme d'un **stack Docker à l'arrêt sur penny**, pas d'un problème de
sauvegarde : AdGuard tombe avec le stack, les LXC perdent la résolution, et tout
ce qui dépend d'un nom échoue en cascade. Vérifier le DNS avant de chercher plus
loin.
