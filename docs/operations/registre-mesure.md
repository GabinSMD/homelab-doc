# Registre de mesure — 30 jours sans incident silencieux

L'objectif visé est un **état mesuré**, pas un livrable : trente jours consécutifs
pendant lesquels aucune panne réelle n'est découverte avant que le homelab l'ait
signalée. Cette page est l'instrument qui rend cet objectif **réfutable**. Un objectif
qu'aucune observation ne peut mettre en défaut est atteint par construction, donc il ne
vaut rien.

Ce n'est pas un journal d'exploitation. Il n'a pas vocation à raconter ce qui s'est
passé — [Incidents recurrents](incidents-recurrents.md) est là pour ça. Il ne consigne
que ce qui permet de trancher les trois critères.

| Page | Rôle |
|---|---|
| Registre de mesure (ici) | le format, les définitions, les règles de comptage |
| [Fenêtre courante](registre-fenetre-courante.md) | **le fichier où l'on écrit** |
| [Modèles du registre](registre-modeles.md) | point hebdomadaire et bilan, à copier |
| [Hygiène des notifications](notif-hygiene.md) | la doctrine « silence sur les succès » que ce registre mesure |

## Les trois critères

1. Zéro incident réel découvert sans alerte préalable.
2. Zéro notification ignorée : toute notification mène à une action ou à la correction
   du contrôle qui l'a émise.
3. Chaque contrôle prouve son effet.

Le critère 1 n'est observable par aucun automatisme : rien ne sait ce qui a été constaté
de visu avant qu'une notification arrive. C'est pourquoi le tableau des incidents
constatés sans alerte préalable est rempli par l'administrateur, et par lui seul.

## Ce qu'on ne met pas dedans

Ce dépôt est **public**. Le registre décrit des pannes et des angles morts, ce qui est
déjà le régime du reste de `operations/` — mais la règle du dépôt s'applique sans
exception : aucun secret, aucun jeton, aucun contenu d'alerte brut copié sans relecture.
On nomme le contrôle et l'effet, jamais la clé.

## Les deux objets consignés

Deux choses de nature différente, qui ne vont pas dans le même tableau parce qu'elles ne
se comptent pas ensemble.

### 1. Les notifications reçues

Tout ce qui est arrivé jusqu'à un humain : ntfy, alerte Grafana, message CrowdSec, mail
d'une unité systemd en échec. Chaque notification porte son **horodatage**, son
**contrôle émetteur** — le nom exact de la sonde, de l'unité ou de la règle d'alerte, pas
« Grafana » ni « ntfy », qui ne sont que des transporteurs —, un résumé d'une ligne, et
son **issue**, parmi exactement trois valeurs :

| Issue | Sens | Compte comme |
|---|---|---|
| `action` | Quelque chose de réel s'est produit et a demandé une intervention. La notification a fait son travail. | signal |
| `correction` | La notification n'était pas actionnable telle quelle : seuil faux, sonde qui observe la mauvaise chose, alerte redondante. **Le contrôle est corrigé** — c'est la correction qui clôt l'entrée, pas la lecture. | bruit traité |
| `ignorée` | Rien n'a été fait, ni action ni correction. | bruit non traité |

Il n'existe **pas** de valeur « fausse alerte, classée sans suite ». Une fausse alerte
sans correction du contrôle est une notification ignorée, donc un échec du critère 2.

`ignorée` exige une raison écrite. C'est le seul champ de texte obligatoire du registre :
une entrée `ignorée` est un échec déclaré, et la raison est ce qui la distingue d'un
oubli. Ne pas maquiller une entrée `ignorée` en `correction` tant que la correction n'est
pas faite — une correction promise est une entrée `ignorée`.

### 2. Les incidents constatés sans alerte préalable

**Renseigné par l'administrateur seul.** C'est ce tableau qui rend les trente jours
réfutables, et c'est le seul. Un registre incapable d'enregistrer un échec ne mesure rien.

Chaque entrée porte : la date et l'heure du **constat**, ce qui était en panne, depuis
quand (une estimation suffit), **comment cela a été vu**, quel contrôle aurait dû le voir,
et si ce contrôle existait.

Trois règles de qualification, écrites d'avance pour ne pas être discutées après coup :

- **Une alerte en retard est une absence d'alerte.** Si la notification est arrivée après
  le constat, l'entrée va dans ce tableau. Le critère porte sur l'ordre, pas sur
  l'existence.
- **Une panne commencée avant la fenêtre compte quand même** si le constat tombe dans la
  fenêtre : le silence, lui, s'est prolongé dans la fenêtre.
- **Un incident constaté en allant vérifier à la suite d'une alerte compte comme alerté**,
  même si l'alerte portait sur autre chose. L'alerte a amené là.

## La fenêtre

Trente jours consécutifs. **J1 est le premier jour où le registre est en place et où
l'administrateur sait où écrire** — pas la date de rédaction de cette page.

Le compteur repart à zéro à tout incident constaté sans alerte préalable. Le nouveau J1
est la **date du constat**, pas celle du début de panne : la date de début est presque
toujours une estimation, et un compteur fondé sur une estimation est négociable.

C'est une définition, pas une punition. Une remise à zéro n'annule aucun travail : elle
dit que l'état visé n'est pas encore tenu. Chaque remise à zéro est consignée dans le
journal des remises à zéro de la fenêtre courante, avec un lien vers l'incident qui l'a
causée. La fenêtre close est archivée, jamais effacée — la suite des fenêtres est
elle-même une mesure.

## Ce qu'on regarde : le rapport signal/bruit

Le point hebdomadaire porte sur le rapport signal/bruit, **jamais sur le volume d'alertes
seul**. Un volume qui baisse parce qu'on a coupé des sondes n'est pas un progrès, c'est le
même problème avec moins de témoins — et c'est le risque propre au mode « boring runs
silent » décrit dans [Hygiène des notifications](notif-hygiene.md), où le silence est
l'état normal.

Notations, par semaine :

- `N` — notifications reçues
- `A` — issue `action` · `K` — issue `correction` · `I` — issue `ignorée` (`A + K + I = N`)
- `S` — incidents constatés sans alerte préalable
- `C` — **contrôles actifs en fin de semaine** : les unités et sondes de
  [Monitoring](monitoring.md), plus les règles d'alerte Grafana, Loki et CrowdSec
- `ΔC` — contrôles désactivés, supprimés, mis en sourdine ou dont le seuil a été élargi
  pendant la semaine, **nommés un par un**

Trois indicateurs :

| Indicateur | Formule | Lecture |
|---|---|---|
| Rapport signal/bruit | `A : (K + I)` | ce qu'on veut voir monter |
| Taux de bruit non traité | `I / N` | critère 2 — doit aller à zéro |
| Incidents silencieux | `S` | critère 1 — toute valeur non nulle remet le compteur à zéro |

La correction d'un contrôle compte comme **bruit traité**, pas comme signal : une
notification qui ne révèle qu'un défaut de sa propre sonde n'a rien appris sur le homelab.
Elle est néanmoins du travail utile, et c'est pourquoi `K` et `I` sont distingués au lieu
d'être additionnés en « bruit ».

:::warning[Règle de lecture obligatoire]
Un rapport qui s'améliore alors que `C` baisse ou que `ΔC` n'est pas vide **n'est pas une
amélioration** tant que la baisse n'est pas justifiée ligne à ligne. C'est pour cela que
`C` et `ΔC` figurent dans le même tableau que le rapport : séparés, on ne les regarde plus.
:::

**Le silence est ambigu.** Une semaine sans notification peut vouloir dire que tout va
bien, ou que plus personne n'écoute. Le point hebdomadaire liste donc aussi les contrôles
qui n'ont rien émis depuis J1. Un `S` nul avec un `N` nul ne prouve rien — c'est
exactement l'angle mort que le canary externe traite côté machine.

## Ce que le registre fournit au classement des contrôles

Le registre produit la matière empirique d'un classement en trois familles, qu'aucun
inventaire sur pièces ne peut établir :

- **muet** — aucun contrôle émis sur toute la fenêtre ;
- **bruyant** — beaucoup d'entrées `correction` ou `ignorée` ;
- **menteur** — resté silencieux pendant un incident inscrit au tableau des incidents
  constatés sans alerte préalable, alors qu'il avait la panne dans son champ
  d'observation.

Le bilan des trente jours reprend ces trois listes.

## Comment écrire dedans, concrètement

Le registre doit coûter peu, sinon il meurt en deuxième semaine.

**L'administrateur fait deux choses, rien de plus :**

1. **Qualifier.** Les notifications sont relevées toutes seules et déposées en section
   1 bis de la [fenêtre courante](registre-fenetre-courante.md) — voir
   [Moissonnage](#moissonnage). Il ne reste qu'à écrire
   l'issue en bout de ligne : `action`, `correction`, ou `ignorée` + raison.

   Ce qui n'a pas été moissonné — un SMS, un coup d'œil à un écran, une alerte d'un chemin
   non journalisé — se jette dans la section « Saisie rapide », format libre :

   ```text
   2026-10-03 14:22 | homelab_monitor:disk | / a 91% | ignorée | seuil trop bas, a revoir
   ```

   Horodatage, contrôle, résumé, issue, raison si `ignorée`. L'ordre compte, le reste non.

2. Remplir le tableau des incidents constatés sans alerte préalable. Celui-là ne se
   délègue pas, et aucun moissonnage ne le remplira jamais.

**Le reste — mise au propre dans les tableaux, compteurs, point hebdomadaire, bilan — ne
revient pas à l'administrateur.** La comptabilité est le prix de l'instrument, pas une
charge à lui ajouter.

## Moissonnage : ce qui se relève tout seul {#moissonnage}

La saisie manuelle des notifications n'a jamais été tenable à ≈ 6,5 notifications par
jour. Elle n'est plus nécessaire : le réplica Loki est lisible, et **l'émission des
notifications y est journalisée**. Les lignes sont relevées automatiquement et déposées en
section 1 bis de la [fenêtre courante](registre-fenetre-courante.md) ; il ne reste qu'à
écrire l'issue.

Deux requêtes couvrent les deux chemins d'émission du parc :

```logql
{container="ntfy-relay"} |= "forwarded" or "non livre"
{job="monitor"} |~ "ALERT|RESOLVED"
```

La première rend `forwarded ntfy=200 title='[FIRING] <règle>' prio=…` — horodatage, règle
Grafana émettrice, code de livraison. La seconde rend `ALERT [<étiquette>]: …` et son
`RESOLVED` — horodatage et contrôle du moniteur.

:::warning[L'émission est auditable, la livraison ne l'est pas]
Ces requêtes prouvent qu'une notification a été **émise**, et pour le seul chemin Grafana
qu'elle a été **acceptée** par ntfy. Aucune ne prouve qu'elle est arrivée sur un téléphone.
Deux traces au dossier : `maintenance active, non livre` — le relais rend 200 sans livrer —
et `ALERT [docker-down]: ntfy send FAILED, will retry` le 2026-09-25. La colonne qui
tranche vraiment reste le tableau des incidents constatés sans alerte préalable, rempli à
la main.
:::

Deux autres limites, dites d'avance :

- **Le titre sans les étiquettes.** Le relais journalise le titre de la règle, pas son
  `instance` ni son `mountpoint`. Le moissonnage nomme le contrôle, pas toujours sa cible.
- **Une ligne non qualifiée compte `ignorée`.** Sinon le moissonnage deviendrait une façon
  de remplir le registre sans jamais décider, et le critère 2 — zéro notification ignorée —
  serait satisfait par l'accumulation.

**Ce qui reste manuel pour toujours** : le tableau des incidents constatés sans alerte
préalable. Aucune requête ne sait ce qui a été vu de visu avant qu'une alerte arrive.

## Archivage

Les artefacts datés ne vivent pas dans `operations/`, qui doit rester le présent :

| Artefact | Où | Nommage |
|---|---|---|
| Point hebdomadaire | `docs/projet/journal/` | `AAAA-MM-JJ-registre-point-sN.md` |
| Bilan de fenêtre close | `docs/projet/journal/` | `AAAA-MM-JJ-registre-bilan-fenetre.md` |

Une fenêtre interrompue se bilan aussi : c'est là que se trouve l'information.

## Fait quand

- Le format est en place et l'administrateur sait où écrire.
- Quatre points hebdomadaires ont été tenus.
- Le bilan des trente jours est rendu : rapport signal/bruit, liste des notifications
  ignorées et pourquoi, liste des incidents constatés sans alerte préalable.
