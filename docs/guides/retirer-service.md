# Retirer un service

Pendant inverse d'[Ajouter un service](ajouter-service.md). Arrêter le conteneur prend
une minute ; ce qui coûte, c'est tout ce qu'il laisse derrière lui, ailleurs.

:::warning[Ce que le retrait de Beszel a laissé derrière lui (2026-11-03 → 04)]
Conteneur arrêté et compose nettoyé le 3 novembre. Le lendemain, il restait encore :
les **agents** sur galahad et lancelot, toujours à l'écoute sur leur port ; trois
**secrets** dans `.env.enc` ; des **clients OIDC** documentés comme actifs ; une
vingtaine de **pages** qui décrivaient le service au présent. Le retrait de Paperclip
avait laissé un **réseau Docker** vide, celui de Zomboid une machine dans le
**tailnet**. Enfin, la procédure break-glass restaurait des **volumes** que la sauvegarde
ne contenait plus depuis avril.

Rien de tout cela ne casse quoi que ce soit le jour même. C'est ce qui le rend invisible.
:::

## Étape 1 — Garder les données

Décider avant de supprimer : on garde, et on dit où.

| Forme du service | Archive finale |
|---|---|
| Volume Docker | `tar` du volume dans `/mnt/ssd/backups/<service>/`, et laisser le volume déclaré (commenté « CONSERVÉ ») dans le compose |
| Base de données | dump (`pg_dump`, `sqlite3 .backup`) dans le même répertoire |
| LXC | sauvegarde PBS finale marquée **protégée**, *avant* `pct destroy` |

```bash
# Sauvegarde PBS protegee d'un LXC (sur le noeud qui le porte)
vzdump <vmid> --storage PBS --mode stop --notes-template "{{guestname}} sauvegarde finale"
# puis dans l'UI PBS : marquer le snapshot « protected »
```

## Étape 2 — Le catalogue d'abord

Dans `src/data/service-catalogue.json` (dépôt `homelab-doc`), passer l'entrée en
`"status": "retired"` avec `"retiredAt": "AAAA-MM-JJ"`, et poser l'encadré de retrait en
tête de la fiche du service.

C'est volontairement la **première** étape côté doc : le contrôle de fraîcheur de la CI
lit ce fichier, et désigne ensuite chaque page qui nomme encore le service au présent.
La liste qu'il produit est la liste des pages à reprendre. Un rappel historique légitime
s'ajoute à `AUTORISE_CATALOGUE` dans `scripts/check-doc-fraicheur.py`, avec sa
justification.

## Étape 3 — Penny : compose, réseau, routes

- Retirer le service du `docker-compose.yml` ; garder la déclaration du volume (étape 1).
- Retirer son **réseau** dédié s'il en avait un, puis vérifier qu'aucune règle ne
  survit : `docker network rm` peut laisser des `DROP` dans la table `raw`, invisibles
  depuis `iptables`.

  ```bash
  nft list ruleset > /tmp/nft-avant.txt
  docker network rm <reseau>
  nft list ruleset | grep -n "<id-court-du-bridge>\|<sous-reseau>"   # doit etre vide
  ```

- Routes Traefik : labels du conteneur, ou fichier dans `traefik/dynamic/`.
- AdGuard : réécriture DNS spécifique, s'il en avait une (le joker n'a rien à retirer).

## Étape 4 — Authentification et secrets

- **Authelia** : le bloc du client OIDC dans `configuration.yml`, et ses règles
  `access_control`. Redémarrer `authelia`.
- **`.env.enc`** : retirer les variables du service. `sops` doit connaître le format :

  ```bash
  F="--input-type dotenv --output-type dotenv"
  sops unset $F .env.enc '["MONSERVICE_TOKEN"]'
  # Verifier que rien d'autre n'a bouge
  diff <(git show HEAD:.env.enc | sops -d $F /dev/stdin | grep -v MONSERVICE | sort) \
       <(sops -d $F .env.enc | sort) && echo identique
  ```

- Les mêmes noms dans `.env.example` et dans la fixture du banc
  (`ansible/fixtures/banc/.env.plain`).
- **Vaultwarden** : supprimer les secrets du service (client OIDC, comptes de secours,
  jetons). C'est la seule étape qu'aucun script ne peut faire.

## Étape 5 — Ce qu'il a posé sur les autres machines

Le point aveugle. Un service supervisé ou supervisant a souvent des **agents**, des
**comptes** et des **règles de pare-feu** sur les nœuds.

```bash
# Sur chaque hote : unites, binaires, utilisateurs, ports
for h in galahad lancelot; do
  tailscale ssh root@$h "systemctl list-unit-files | grep -i <service>; \
    ls /opt | grep -i <service>; getent passwd | grep -i <service>; \
    ss -ltnp | grep -i <service>"
done
```

- Comptes Proxmox/PBS (`<service>@pve`, jetons) : `pveum user list`, et leur dérogation
  dans `scripts/comptes-convention-check.sh`.
- Machine dans le **tailnet** : la retirer de la console Tailscale.

## Étape 6 — Supervision et sauvegarde

Chaque contrôle qui le surveillait va soit hurler, soit se taire en mentant.

| Où | Quoi |
|---|---|
| `homepage/services.yaml` | la tuile et son widget |
| `scripts/outillage-health-check.sh` | la cible de la sonde |
| Grafana (`rules.yml`) | ses règles, **retirées par un bloc `deleteRules`** — les enlever du fichier ne suffit pas, voir [Grafana](../services/grafana.md) |
| `scripts/homelab_backup.sh` | son entrée dans `VOLUMES=` |
| [Break-glass](../operations/break-glass.mdx), phase 4 | la boucle de restauration, **copie** de `VOLUMES=` : les deux listes doivent rester identiques |
| [Sauvegardes](../operations/backups.md) | le tableau des volumes |
| Timers sur penny | `systemctl list-timers --all \| grep -i <service>` |

Pour un LXC, en plus : `pct destroy`, son fichier `iac/terraform/<vmid>-lxc-<nom>.tf`
(sinon le prochain `tofu plan` voudra le recréer), sa ligne dans
`system/alloy/README.md`, son règlement de pare-feu `/etc/pve/firewall/<vmid>.fw`.

## Étape 7 — Vérifier qu'il ne reste rien

```bash
cd /mnt/ssd/config && grep -rni "<service>" --exclude-dir=.git . | grep -v "^./docs/"
cd /mnt/ssd/homelab-doc && python3 scripts/check-doc-fraicheur.py
```

Le premier `grep` ne doit plus renvoyer que des commentaires datés (« retiré le … »).
Le second doit être vert.

## Checklist rapide

- [ ] Données archivées, emplacement noté dans la fiche
- [ ] Catalogue : `retired` + `retiredAt` ; fiche avec encadré de retrait
- [ ] Compose, réseau (et règles `nft`), routes Traefik, DNS
- [ ] Client OIDC et `access_control` Authelia
- [ ] `.env.enc`, `.env.example`, fixture du banc, Vaultwarden
- [ ] Agents, comptes, ports et pare-feu sur **les autres hôtes** ; tailnet
- [ ] Homepage, sondes, règles Grafana (`deleteRules`), timers
- [ ] `VOLUMES=` **et** boucle de la phase 4 de break-glass
- [ ] `grep` du dépôt config et contrôle de fraîcheur verts
