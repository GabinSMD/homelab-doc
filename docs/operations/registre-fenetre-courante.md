# Registre — fenêtre courante

Le fichier où l'on écrit. Format, définitions et règles de comptage :
[Registre de mesure](registre-mesure.md). Trois valeurs d'issue seulement — `action`,
`correction`, `ignorée` — et une entrée `ignorée` exige une raison.

## En-tête

**Fenêtre ouverte.** Les trois pages sont en ligne depuis le 2026-10-01, l'administrateur
sait où écrire : la condition de J1 est remplie.

| | |
|---|---|
| **J1 (début de fenêtre)** | **2026-10-01** |
| **J30 visé** | **2026-10-30** |
| **Jour courant** | mis à jour à chaque point hebdomadaire |
| **Remises à zéro depuis l'ouverture du suivi** | 0 |
| **Contrôles actifs à J1 (`C₀`)** | **52** — voir ci-dessous |

### `C₀` = 52, et ce que ce nombre ne compte pas

| Famille | Nombre | Source |
|---|---|---|
| Règles d'alerte Grafana | 20 | [Inventaire des contrôles](inventaire-controles.md) §2.2 |
| Minuteurs systemd | 32 | [Inventaire des contrôles](inventaire-controles.md) §2.4 |
| Profils de notification CrowdSec | **0** | §3, **R-08** : toutes les lignes `notifications:` sont commentées |

CrowdSec bannit sans jamais notifier : il n'entre pas dans `C` parce qu'il ne peut émettre
aucune notification. Le compter aurait gonflé le dénominateur avec un contrôle qui ne peut
pas, par construction, produire une entrée de ce registre.

`C₀` est un nombre de contrôles **déclarés**, pas de contrôles prouvés. L'inventaire
établit qu'à l'ouverture, 24 sondes sur 32 et 16 règles sur 20 n'ont rien émis en 30 jours.
C'est précisément ce que les trente jours doivent trancher — d'où le tableau §5 : toute
baisse de `C` doit se lire à côté du rapport, jamais à sa place.

### Référence d'avant-fenêtre

Mesuré sur les 30 jours précédant J1 (2026-09-02 → 2026-10-01), pour que la semaine 1 ait
un point de comparaison au lieu de partir de rien :

| | Valeur | Réserve |
|---|---|---|
| Messages publiés sur ntfy | **194** (≈ 6,5 / jour) | compteur interne de ntfy, remis à zéro si le service redémarre |
| Dont passés par le relais Grafana | **35** (18 %) | comptés ligne à ligne |
| Dont émis en direct par les sondes | **≈ 159** (82 %) | déduits par différence |
| Alertes émises (`ALERT` du moniteur) | **86** | dont 49 par trois étiquettes seulement |

Ce n'est **pas** un `N` de référence : le registre compte les notifications arrivées
jusqu'à un humain, le compteur ntfy compte les messages publiés. Les deux séries ne se
recouvrent pas exactement. La comparaison utile est celle des **ordres de grandeur** et de
la **tendance**, pas celle des valeurs.

---

## 1. Saisie rapide — administrateur

Jeter les lignes ici au fil de l'eau, format libre :
`horodatage | contrôle | résumé | issue | raison si ignorée`

Ces lignes sont reprises au point hebdomadaire et mises au propre dans le tableau 2. Ne
pas s'occuper de la mise en forme.

```text
(vide)
```

### 1 bis. Moissonné automatiquement — à qualifier seulement

Les lignes ci-dessous sont relevées dans Loki, pas saisies à la main : voir
[Moissonnage](registre-mesure.md#moissonnage). Il ne reste
qu'à écrire l'issue en bout de ligne (`action`, `correction`, `ignorée` + raison).
Une ligne non qualifiée au point hebdomadaire est comptée `ignorée` — c'est la règle, et
c'est ce qui empêche le moissonnage de devenir une façon de ne plus décider.

```text
2026-10-01 04:57 | Grafana: Systeme de fichiers > 90 % | FIRING, livré ntfy=200 | ?
2026-10-01 10:45 | moniteur: oom-kill | loki tué par l'OOM-killer (4476/7870 Mo) ; RESOLVED à 10:56 | ?
```

Deux remarques sur ces deux premières lignes, parce qu'elles sont instructives :

- **`Systeme de fichiers > 90 %` n'est pas résolu.** Dernier `RESOLVED` le 2026-09-26
  08:12 ; depuis, `FIRING` les 09-30 16:52, 10-01 04:57, à l'intervalle de répétition de
  12 h. La fenêtre s'ouvre donc sur une alerte ouverte. Ce n'est pas un incident
  silencieux — l'alerte est arrivée —, mais c'est exactement le profil « bruyante sans
  hystérésis » relevé à l'inventaire, et sa qualification tranchera entre `action` et
  `correction`.
- **Le log du relais porte le titre de la règle, pas ses étiquettes.** On sait qu'un
  système de fichiers a franchi 90 % ; on ne sait pas lequel, ni sur quel hôte. Le moniteur
  de penny rapporte `DISK SD: 57%` / `DISK SSD: 18%` sur toute la journée : ce n'est donc
  pas penny. Faire journaliser `instance` et `mountpoint` par le relais est un correctif à
  un coût d'une ligne, et sans lui le moissonnage nomme le contrôle sans nommer sa cible.

---

## 2. Notifications reçues

Mise au propre au point hebdomadaire, depuis les sections 1 et 1 bis. Une entrée n'arrive
ici **qu'avec son issue** : tant qu'elle n'est pas qualifiée, elle reste au-dessus.

| # | Horodatage | Contrôle émetteur | Notification | Issue | Suite donnée / raison |
|---|---|---|---|---|---|
| | | | | | |

_Aucune entrée qualifiée. Deux lignes en attente de qualification en section 1 bis._

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

_Aucun changement. `C` = 52 depuis J1._

Rappel : tout contrôle mis en sourdine au titre de
[Hygiène des notifications](notif-hygiene.md) doit apparaître ici. Un silence décidé reste
un silence, et le registre ne peut pas distinguer un pari de silence d'un angle mort si le
pari n'est pas écrit.

---

## 6. Calendrier de la fenêtre

| Échéance | Date | Ce qui est produit |
|---|---|---|
| J1 — ouverture | 2026-10-01 | cette page |
| Point S1 | 2026-10-08 | `docs/projet/journal/2026-10-08-registre-point-s1.md` |
| Point S2 | 2026-10-15 | `…-2026-10-15-registre-point-s2.md` |
| Point S3 | 2026-10-22 | `…-2026-10-22-registre-point-s3.md` |
| Point S4 | 2026-10-29 | `…-2026-10-29-registre-point-s4.md` |
| J30 — bilan | 2026-10-30 | `docs/projet/journal/2026-10-30-registre-bilan-fenetre.md` |

Ces dates glissent d'un bloc à toute remise à zéro : le nouveau J1 est la date du constat,
et les quatre points sont recalés dessus. La fenêtre interrompue est bilanée avant d'être
archivée — c'est là que se trouve l'information.
