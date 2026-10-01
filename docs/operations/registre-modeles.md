# Registre — modèles

Deux modèles à copier. Définitions et règles de comptage :
[Registre de mesure](registre-mesure.md). Les copies datées vont dans
`docs/projet/journal/`, pas dans `operations/`.

## Point hebdomadaire

Copier dans `docs/projet/journal/AAAA-MM-JJ-registre-point-sN.md`. Tenu à partir de la
[fenêtre courante](registre-fenetre-courante.md). Porte sur le rapport signal/bruit,
jamais sur le volume d'alertes seul.

```markdown
# Registre — point de la semaine SN (J— a J— / 30)

## Compteurs

| | Cette semaine | Cumul fenetre |
|---|---|---|
| `N` — notifications recues | | |
| `A` — `action` | | |
| `K` — `correction` | | |
| `I` — `ignoree` | | |
| `S` — incidents constates sans alerte prealable | | |
| `C` — controles actifs en fin de semaine | | — |
| `dC` — controles retires / elargis | | |

## Indicateurs

| Indicateur | Valeur | Semaine precedente | Sens |
|---|---|---|---|
| Rapport signal/bruit `A : (K + I)` | | | hausse visee |
| Taux de bruit non traite `I / N` | | | vers 0 |
| Incidents silencieux `S` | | | 0 obligatoire |

**Controle de lecture.** `dC` est-il vide ? Sinon, le rapport n'est PAS lisible comme
une amelioration tant que chaque retrait n'est pas justifie ci-dessous.

| Controle retire / elargi | Raison | Ce qui le remplace | Angle mort cree ? |
|---|---|---|---|
| | | | |

## Notifications ignorees cette semaine

Une ligne par entree `ignoree`, avec sa raison. C'est la liste qui doit se vider.

| Horodatage | Controle | Raison de l'ignorance | Ce qu'on en fait |
|---|---|---|---|
| | | | |

## Silence

Controles n'ayant rien emis depuis J1 — candidats muets. Un `S` nul avec un `N` nul ne
prouve rien.

- (liste)

## Incidents constates sans alerte prealable

| Constat | Incident | Controle attendu | Existait-il ? | Compteur remis a zero ? |
|---|---|---|---|---|
| | | | | |

## Etat de la fenetre

- Jour courant : J— / 30
- Remise a zero cette semaine : oui / non
- Si oui : nouveau J1 au —

## Ce qui change la semaine prochaine

- (une ligne par decision, avec son porteur)
```

## Bilan de fenêtre

Copier dans `docs/projet/journal/AAAA-MM-JJ-registre-bilan-fenetre.md` à la clôture d'une
fenêtre, qu'elle soit allée au bout ou qu'elle ait été remise à zéro.

```markdown
# Registre — bilan de fenetre : J1 AAAA-MM-JJ vers J30 AAAA-MM-JJ

## Verdict

- Fenetre menee a 30 jours : oui / non
- Si non, jour d'interruption : J—, incident n°—

| Critere | Mesure | Tenu ? |
|---|---|---|
| 1. Zero incident reel decouvert sans alerte prealable | `S` total = — | |
| 2. Zero notification ignoree | `I` total = — | |
| 3. Chaque controle prouve son effet | — controles convertis / — controles | |

## Rapport signal/bruit sur la fenetre

| Semaine | `N` | `A` | `K` | `I` | `S` | `C` | `A : (K+I)` | `I / N` |
|---|---|---|---|---|---|---|---|---|
| S1 | | | | | | | | |
| S2 | | | | | | | | |
| S3 | | | | | | | | |
| S4 | | | | | | | | |
| **Total** | | | | | | | | |

Trajectoire, en une phrase : —

**Le volume seul ne dit rien.** `C` a-t-il bouge sur la fenetre ? De combien, et a cause
de quoi ? Un rapport ameliore sur un parc de controles reduit est un rapport a jeter.

## Notifications ignorees — la liste et le pourquoi

| Horodatage | Controle | Raison invoquee | Toujours vraie aujourd'hui ? | Suite |
|---|---|---|---|---|
| | | | | |

Regroupement par cause, pour ne pas traiter vingt symptomes d'un meme defaut :

- (cause) — n entrees — decision

## Incidents constates sans alerte prealable

| Constat | Incident | Duree silencieuse estimee | Comment il a ete vu | Controle attendu | Existait-il ? | Pourquoi il s'est tu |
|---|---|---|---|---|---|---|
| | | | | | | |

Pour chacun, la question qui compte : **absence de controle, ou controle present et
muet ?** La premiere renvoie a l'inventaire des risques sans controle, la seconde a la
conversion en controles prouvants.

## Classement des controles

| Controle | Classement | Fonde sur |
|---|---|---|
| | muet / bruyant / menteur | — |

- **muets** — rien emis sur toute la fenetre.
- **bruyants** — nombreuses entrees `correction` ou `ignoree`.
- **menteurs** — silencieux pendant un incident qui etait dans leur champ d'observation.

## Angles morts confirmes par la mesure

Ce que 30 jours d'observation ont confirme et qu'aucun inventaire sur pieces n'aurait
trouve. En particulier : les controles co-localises avec ce qu'ils observent, qui se
taisent exactement quand il faudrait qu'ils parlent.

- (liste)

## Cout du registre

S'il coute trop, il ne survivra pas a une deuxieme fenetre.

- Saisies administrateur sur la fenetre : —
- Part automatisable aujourd'hui : —
- Ce qu'on change au format pour la fenetre suivante : —

## Suite

- Fenetre suivante ouverte le — (J1)
- Decisions portees ailleurs : —
```
