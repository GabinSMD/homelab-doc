# Audit de fraîcheur de la documentation — 2026-08-26

**Portée** : les 56 pages de `homelab-doc`, juste après la migration vers Docusaurus.
**Nature** : un rapport. Les corrections appliquées sont listées et bornées ; le reste
est à arbitrer, pas à subir.

## Ce que cet audit a vérifié, et ce qu'il n'a pas vérifié

Vérifié : la date du dernier commit de chaque page, les états auto-déclarés
(`État (date)`), et la présence de références à des choses dont on **sait** qu'elles
ont changé — MkDocs, `fish`, Backblaze B2, IT Tools, `ntfy.sh` public. Puis lecture
des pages où un de ces signaux pouvait tromper un lecteur en situation réelle.

**Non vérifié** : l'exactitude technique de chaque affirmation. Personne n'a rejoué
les 56 pages contre la production. Une page peut être fraîche de date et fausse sur
le fond.

Un mot sur la méthode, parce qu'elle a failli déraper : le `grep` initial remontait
19 pages « suspectes » sur 56. La majorité étaient des **références historiques
légitimes** — `r2-migration.md` parle de B2 parce que c'est son sujet, et les
mentions de `fish` dans la spec Homepage sont précisément le document qui explique
que le contenu était périmé. Le comptage n'est pas la conclusion. C'est la même
erreur qui avait mis cinq affirmations fausses dans le plan de migration Docusaurus.

## Le motif qui revient : le dépôt sait, le document l'ignore

Trois fois sur cet audit, l'information juste existait **déjà** ailleurs dans le
dépôt, et n'avait simplement jamais atteint la page qu'on lit en situation.

| La page dit | Le dépôt savait, ici | Écart |
|---|---|---|
| `break-glass` restaure depuis B2 | `r2-migration.md` documente le passage à `AWS_*` | 3 mois ½ |
| Egress phase 2 « en préparation » | `securite/roadmap.md` : déployé le 2026-05-05 | 3 mois ½ |
| sucre « livré et prouvé en production » | le service est arrêté depuis le 2026-08-25 | 1 jour |

Ce n'est pas un problème de rédaction, c'est un problème de propagation. Rien ne
relie une page à l'état réel de ce qu'elle décrit.

## Ce qui a été corrigé

### La procédure de reprise après sinistre ne pouvait pas s'authentifier

Le résultat le plus lourd de l'audit, et le seul qui n'est pas une question de
fraîcheur mais un défaut.

`operations/break-glass.mdx` — la page qu'on suit quand tout a brûlé — donnait cinq
fois la commande :

```bash
source /root/.restic-env && export RESTIC_PASSWORD RESTIC_REPOSITORY B2_ACCOUNT_ID B2_ACCOUNT_KEY
```

Deux défauts cumulés. `/root/.restic-env` ne contient plus aucune variable `B2_*`
depuis la migration vers Cloudflare R2 du **2026-05-11** ; il porte
`AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY`. Et comme ce fichier utilise des
**assignations simples, sans `export`**, un `source` seul ne transmet rien à
`restic`, qui est un processus enfant. La commande exportait donc deux variables
inexistantes et laissait de côté les deux qui servent.

Vérifié sur un fichier factice plutôt qu'affirmé :

```console
$ source demo-env && export RESTIC_PASSWORD RESTIC_REPOSITORY B2_ACCOUNT_ID B2_ACCOUNT_KEY
$ env | grep -E '^(AWS_ACCESS_KEY_ID|RESTIC_PASSWORD)='
RESTIC_PASSWORD=<defini>          # AWS_ACCESS_KEY_ID absent
```

Corrigé dans `break-glass.mdx` (5 occurrences) et `operations/backups.md` (3), avec
la liste `RESTIC_PASSWORD RESTIC_REPOSITORY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY`.

:::danger[Pourquoi ça a tenu trois mois et demi]
**Aucun chemin de code n'exécute cette page.** Un runbook n'est vérifié que par un
exercice de reprise qui le suit à la lettre — et l'exercice mensuel
([`dr-drill-scenario-1`](../operations/dr-drill-scenario-1.md)) porte sur
Vaultwarden, pas sur le parcours complet de `break-glass`. Le même mécanisme avait
déjà laissé quatre fiches de remède de sucre pointer vers des scripts inexistants
pendant quatre mois : un chemin jamais emprunté se dégrade en silence.
:::

### Le reste des corrections

| Page | Ce qui était faux | Correction |
|---|---|---|
| `projet/sucre.md` | « MVP livré et prouvé en production », état du 2026-04-20 | Bandeau d'arrêt + [Bilan et arrêt](sucre.md#bilan-et-arrêt) chiffré |
| `operations/incidents-recurrents.md` | Compteurs de fréquence présentés comme vivants | Marqués figés au 2026-08-25 (sucre les alimentait) |
| `operations/monitoring.md` | « `check_restic_repos_freshness` queries B2 » | Décrit R2, le backend réel |
| `architecture/sucre-observability.md` | Architecture d'observation au présent | Bandeau d'arrêt |
| `securite/egress-phase2-plan.md` | « État au 2026-04-19 (préparation) » | Bandeau : déployé le 2026-05-05 |
| `projet/about.md` | « Ce site est généré avec MkDocs Material » | Docusaurus |

Une seule ancre publiée était touchée
(`#restaurer-vaultwarden-depuis-restic-b2`) : elle est **préservée** par un id
explicite, le titre seul change. Une ancre est une URL.

## À arbitrer — non corrigé

Ces points demandent une décision, pas une réécriture mécanique.

- **`securite/comptes.md`** inventorie encore des « B2 credentials » dans
  Vaultwarden. Si B2 est décommissionné depuis le 2026-05-29, ces identifiants
  devraient être révoqués et l'entrée supprimée. C'est une tâche de rotation, pas
  de documentation.
- **`projet/2026-08-15-forgejo-source-de-verite.md`** décrit au présent un
  `deploy.yml` qui « construit MkDocs ». C'est une spec datée : soit on la laisse
  figée comme les autres specs, soit on lui met un bandeau. Choisir une règle et
  l'appliquer à toutes les specs de `projet/`.
- **`projet/roadmap.md` et `projet/roadmap-2026-05.md`** n'ont pas bougé depuis le
  2026-07-06. Une roadmap non revue depuis sept semaines n'est pas fausse, elle est
  muette — et rien ne dit au lecteur laquelle des deux fait foi.
- **`guides/index.md`, `projet/index.md`, `securite/index.md`** font 10 ou 11 lignes
  et datent du 2026-05-05. Pages d'aiguillage volontairement minces, ou oubliées ?
- **Aucun contrôle automatique de fraîcheur.** Tout ce rapport est le produit d'une
  passe manuelle. Un job qui échouerait sur une page dont l'état déclaré dépasse
  N jours, ou qui référencerait un service arrêté, remplacerait cet exercice.

## Ce qui est correct et ne doit pas être « corrigé »

Consigné pour qu'un prochain audit ne les remonte pas une deuxième fois :
`operations/r2-migration.md` et `operations/b2-cap-exceeded.md` parlent de B2 parce
que c'est leur sujet ; `operations/dr-drill-scenario-1.md` porte déjà la note
« B2 décommissionné le 2026-05-29 » ; le bloc replié de `securite/roadmap.md`
décrit la sonde `check_b2_cap` **et** son extinction post-migration ; et les
mentions de `fish` dans `projet/2026-08-03-homepage-refonte-design.md` sont le
constat de péremption lui-même.
