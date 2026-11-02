# Gestion des issues

Les issues du dépôt **`homelab-config`** sur Forgejo sont la source de vérité du travail
sur le homelab : pannes, maintenance, évolutions, vérifications à faire plus tard. Une
seule adresse, y compris pour la doc. Inspiré des conventions de FFD-Connect, adapté à
Forgejo, qui n'a ni types d'issue, ni champs personnalisés, ni vues de projet comme
GitHub.

## Le tableau

Un tableau kanban unique, **« Homelab »**, au niveau du compte. Les colonnes :

| Colonne | Ce qu'on y trouve |
|---|---|
| **À trier** | Issue créée, pas encore classée (type, priorité, effort) |
| **Prêt** | Classée, rien ne bloque, peut être prise |
| **En cours** | Quelqu'un (ou Claude) travaille dessus |
| **En revue** | Une PR est ouverte ; fusion automatique dès que la CI exigée est verte |
| **À vérifier** | Fusionné ou déployé, reste une vérification datée (étiquette `état/à-vérifier`) |
| **Fait** | Fermée |

## Titre

Format **`DOMAINE: phrase en français`**, sans point final. La phrase dit le **symptôme
observé** pour un bug, le **résultat attendu** sinon.

- Bon : `PENNY: redémarrage par le watchdog à 15:02` — `PULSE: retirer le relevé mémoire après le 9/11`
- Mauvais : `[BUG] souci`, `fix`, `Amélioration`

Domaines : `RÉSEAU`, `DNS`, `SAUVEGARDES`, `SÉCURITÉ`, `SUPERVISION`, `ALERTES`, `SERVICES`,
`PROXMOX`, `PENNY`, `MATÉRIEL`, `CI`, `DÉPS`, `DOC`, `IAC`, `COÛT`. Une epic nomme son
thème, sans préfixe.

## Étiquettes

Les familles `type/`, `priorité/` et `effort/` sont **exclusives** : Forgejo n'en accepte
qu'une par issue. C'est l'équivalent des champs Type, Priority et Effort des projets
GitHub.

| Famille | Valeurs | Règle |
|---|---|---|
| `type/` | `bug`, `tâche`, `évolution`, `epic` | Obligatoire, posée par le formulaire |
| `priorité/` | `urgente` (maintenant), `haute` (cette semaine), `moyenne` (ce mois-ci), `basse` | Une sur toute issue ouverte, sauf epic et icebox |
| `effort/` | `faible` (< 1 h), `moyen` (une session), `élevé` (plusieurs, ou dépend d'un tiers) | Estimation grossière, corrigée en cours de route |
| `machine/` | `penny`, `galahad`, `lancelot`, `réseau` | Autant que nécessaire |
| `état/` | `icebox`, `bloqué`, `à-vérifier` | `bloqué` va avec une dépendance « Dépend de #N » |
| `humain` | — | L'issue demande une action de l'utilisateur : interface, matériel, décision |

La liste fait foi dans `homelab-config/.forgejo/labels.yaml`, appliquée par
`scripts/forgejo-labels-sync.py` (crée ou met à jour, ne supprime jamais).

## Description

Les formulaires (`.forgejo/ISSUE_TEMPLATE/`) imposent la structure. Pour un bug, la
section **Constat** porte la **preuve** — sortie de commande, journal, heure — et la
**piste** distingue ce qui est mesuré de ce qui est supposé : c'est la règle qui a évité
le plus de fausses pistes sur ce homelab.

Quand une issue vieillit, on n'en réécrit pas l'historique : on ajoute en tête une section
**`## État au AAAA-MM-JJ`**.

## Epics

Une epic regroupe plusieurs issues autour d'un thème (une migration, un nouveau service).
Forgejo n'a pas de sous-issues : on lie chaque issue à l'epic par une **dépendance**, et
l'epic tient une liste à cocher de ses issues. Pas de priorité sur une epic : elle se lit
sur ses issues.

## Les PR

- Toute PR référence une issue : **`Closes #N`** la ferme à la fusion, **`Refs #N`** la
  laisse ouverte (vérification à faire après déploiement).
- `main` est protégée : on passe par une PR, et la **CI exigée** par la protection doit
  être verte.
- **Fusion automatique** : Claude fusionne lui-même ses PR quand la CI exigée est verte,
  puis vérifie que `refs/heads/main` a réellement avancé. Renovate fusionne seul ses mises
  à jour d'empreinte, de correctif et mineures ; les **majeures** attendent une
  approbation.
- **Fusionner ne déploie rien.** Le modèle de PR a une section **Déploiement** qui dit ce
  qu'il faut faire ensuite : mise à jour du clone de penny, `docker compose up`,
  déploiement vers un LXC…
