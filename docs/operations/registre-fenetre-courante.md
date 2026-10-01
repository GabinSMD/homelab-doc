# Registre — fenêtre courante

Le fichier où l'on écrit. Format, définitions et règles de comptage :
[Registre de mesure](registre-mesure.md). Trois valeurs d'issue seulement — `action`,
`correction`, `ignorée` — et une entrée `ignorée` exige une raison.

## En-tête

| | |
|---|---|
| **J1 (début de fenêtre)** | _non ouverte — à renseigner le jour où le registre est en place_ |
| **Jour courant** | J— / 30 |
| **Remises à zéro depuis l'ouverture du suivi** | 0 |
| **Contrôles actifs (`C`)** | à figer à J1, depuis [Monitoring](monitoring.md) et les règles Grafana / Loki / CrowdSec |

---

## 1. Saisie rapide — administrateur

Jeter les lignes ici au fil de l'eau, format libre :
`horodatage | contrôle | résumé | issue | raison si ignorée`

Ces lignes sont reprises au point hebdomadaire et mises au propre dans le tableau 2. Ne
pas s'occuper de la mise en forme.

```text
(vide)
```

---

## 2. Notifications reçues

| # | Horodatage | Contrôle émetteur | Notification | Issue | Suite donnée / raison |
|---|---|---|---|---|---|
| | | | | | |

_Aucune entrée : la fenêtre n'est pas ouverte._

---

## 3. Incidents constatés sans alerte préalable — administrateur seul

Le cœur du registre. Une entrée ici remet le compteur à zéro à la date du constat.

Rappel des règles de qualification : une alerte arrivée **après** le constat est une
absence d'alerte ; une panne commencée avant la fenêtre compte si le constat tombe
dedans ; un incident trouvé en allant vérifier à la suite d'une alerte, même portant sur
autre chose, ne compte pas ici.

| # | Constat (date et heure) | Ce qui était en panne | Depuis quand (estimation) | Comment cela a été vu | Contrôle qui aurait dû le voir | Ce contrôle existait-il ? |
|---|---|---|---|---|---|---|
| | | | | | | |

_Aucune entrée._

---

## 4. Journal des remises à zéro

| Date du constat | Incident (section 3) | Ancien J1 | Nouveau J1 | Bilan archivé |
|---|---|---|---|---|
| | | | | |

_Aucune remise à zéro._

---

## 5. Changements de contrôles (`ΔC`)

Toute sonde ou règle désactivée, supprimée, mise en sourdine, ou dont le seuil a été
élargi. Une ligne par contrôle, avec la raison — sans ce tableau, une baisse du bruit est
indistinguable d'une baisse de la vigilance.

| Date | Contrôle | Changement | Raison | `C` après |
|---|---|---|---|---|
| | | | | |

_Aucun changement._
