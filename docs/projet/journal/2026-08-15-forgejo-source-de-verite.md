# Forgejo source de vérité — design, phase 1

**Date** : 2026-08-15
**Statut** : validé, en attente d'une action manuelle avant démarrage
**Portée** : les 13 dépôts GitHub, les clones de travail sur penny, la configuration de Forgejo

:::note[Spec figée à sa date]
Convention retenue le 2026-08-26 pour toutes les specs de `projet/` : **une spec
est un artefact daté, on ne la réécrit pas.** Quand la réalité a bougé, on ajoute
un encadré comme celui-ci plutôt que de retoucher le corps du texte.

Ici : `deploy.yml` ne construit plus MkDocs mais Docusaurus depuis le 2026-08-26
(voir [le plan de migration](2026-08-25-migration-docusaurus.md)). Le raisonnement
ci-dessous sur la contradiction Forgejo/Pages reste valable — seul l'outil de build
a changé.
:::

## Objectif

Faire de Forgejo hébergé sur penny la source de vérité du code, et de GitHub une
réplique privée hors-site. À terme, les Actions ne devront plus s'exécuter sur
GitHub.

Ce document couvre la **phase 1 uniquement** : le code et la réplication. Le CI
n'est pas touché. Ce découpage n'est pas de la prudence gratuite — il résout une
contradiction que la demande initiale contenait, expliquée plus bas.

## État constaté

Relevé le 2026-08-15, pas supposé.

| | |
|---|---|
| Dépôts GitHub | 13 (5 privés, 8 publics) |
| Dépôts réellement actifs | `homelab-config`, `homelab-doc`, `waterline`, `petanque` |
| Workflows | `homelab-config` : 1 fichier, 4 jobs · `homelab-doc` : CI + déploiement |
| `runs-on` utilisés | `ubuntu-latest` partout (donc amd64) |
| Renovate | actif sur `homelab-config` seul, **3 PR ouvertes** (#95, #96, #97) |
| Branches distantes de `homelab-config` | **40** |

## La contradiction à résoudre

`homelab-doc/.github/workflows/deploy.yml` construit MkDocs et publie sur GitHub
Pages ; `homelab.gabin-simond.fr` résout vers Cloudflare, qui proxifie Pages.

**Couper les Actions sur GitHub arrête donc la publication de la documentation
publique.** Et elle ne peut pas être servie depuis penny : la box ne redirige
aucun port, l'accès externe passe uniquement par Tailscale.

La phase 1 laisse les Actions GitHub actives. La documentation continue d'être
publiée, le CI continue de valider, et Renovate reste une question ouverte plutôt
qu'une panne. Le prix : GitHub reste dans la boucle. C'est assumé et temporaire.

## Le piège technique principal

**Le miroir push de Forgejo utilise la sémantique `git push --mirror` : il
supprime les références distantes absentes en local.**

Sur `homelab-config`, avec 40 branches et 3 PR Renovate ouvertes, activer le
miroir sans précaution effacerait les branches de Renovate et fermerait ses
demandes. C'est destructif et silencieux.

D'où l'ordre imposé plus bas : on vide Renovate **avant** de brancher le miroir,
jamais l'inverse.

## Décisions

### Renovate est vidé puis suspendu

Les 3 PR ouvertes sont traitées — fusionnées ou fermées — **par une personne**,
pas automatiquement : ce sont des mises à jour de dépendances et de digests qui
demandent un jugement. L'application GitHub est ensuite suspendue.

Les mises à jour de dépendances sont donc en pause jusqu'à la phase 2. Le
contrôle compensatoire existe déjà : `digest-drift-check.sh` continue de
surveiller la dérive entre les digests épinglés et ce qui tourne.

### Les clones de travail basculent

Sur penny, `/mnt/ssd/config` et `/mnt/ssd/homelab-doc` prennent Forgejo comme
`origin`, GitHub restant accessible sous le nom `github`. Les deux dépôts ont du
travail en cours au moment de la bascule : elle se fait branche par branche, pas
par un reclonage.

### GitHub devient lecture seule, et ça se documente

Le jour où le homelab est à terre — comme le 2026-08-14 — les runbooks restent
lisibles sur GitHub, mais aucun correctif ne peut y être poussé qui fasse
autorité : Forgejo l'écraserait au retour du service.

Ce n'est pas un défaut à corriger en phase 1, c'est une procédure à écrire dans
`operations/`. Un correctif d'urgence se pousse sur GitHub **et** se rejoue dans
Forgejo au retour, ou attend.

## Étapes

1. **Prérequis manuel** : traiter les 3 PR Renovate, puis suspendre l'application.
2. Créer un jeton d'accès GitHub en lecture pour l'import.
3. Importer les 13 dépôts dans Forgejo (code, tickets, releases, wiki).
4. Vérifier l'import : nombre de branches, d'étiquettes et de tickets par dépôt.
5. Activer le miroir push vers GitHub, un dépôt à la fois, en commençant par un
   dépôt dormant pour valider le mécanisme sans risque.
6. Basculer les clones de penny.
7. Écrire la procédure d'accès en urgence dans `homelab-doc`.

## Ce qui est explicitement exclu — phase 2

- **Les runners Forgejo.** Le sujet est réel : les workflows sont en
  `ubuntu-latest`, donc amd64, alors que penny est en arm64 — un piège rencontré
  deux fois le 2026-08-15, dont une image *étiquetée* arm64 contenant des
  binaires x86-64. Les nœuds x86 conviendraient mais n'ont que 5,12 Go de VG
  libres chacun, ce qui est très juste pour du CI. Bon disque au mauvais endroit,
  bonne architecture sans disque.
- **La désactivation des Actions GitHub**, scriptable via
  `PUT /repos/{owner}/{repo}/actions/permissions`. Elle suppose que le CI et la
  publication de la doc aient trouvé leur nouveau foyer.
- **Renovate auto-hébergé** pointant sur Forgejo.

## Coût

Aucun service nouveau, aucune RAM, aucune ligne de sauvegarde supplémentaire :
Forgejo tourne déjà et est déjà couvert par `homelab_backup.sh`. La phase 1 est
de la configuration.

## Vérifications attendues

L'implémentation n'est terminée que si chacun de ces points est constaté :

1. Chaque dépôt importé a le même nombre de branches et d'étiquettes que
   l'original.
2. Les tickets et releases des dépôts qui en ont sont présents.
3. Le premier miroir activé, sur un dépôt dormant, n'a supprimé aucune référence
   distante.
4. Un commit poussé dans Forgejo apparaît sur GitHub sans intervention.
5. Les 40 branches de `homelab-config` sont toujours présentes sur GitHub après
   activation de son miroir.
6. La documentation publique est toujours publiée après la bascule.
