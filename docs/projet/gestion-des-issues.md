# Gestion des issues

Les issues du dépôt **`homelab-config`** sur Forgejo sont la source de vérité du travail
sur le homelab : pannes, maintenance, évolutions, vérifications à faire plus tard. Une
seule adresse, y compris pour la doc. Inspiré des conventions de FFD-Connect, adapté à
Forgejo, qui n'a ni types d'issue, ni champs personnalisés, ni vues de projet comme
GitHub.

## Le statut

Forgejo 13 n'a pas d'API pour les tableaux de projet : leurs colonnes ne se déplacent qu'à
la souris. Le statut est donc porté par une **famille d'étiquettes exclusives**
`statut/…` (une seule à la fois), que Claude tient à jour par l'API au fil du travail.
Chaque lien ouvre la liste des issues dans ce statut — à mettre en favori, c'est la vue
« colonnes » :

| Statut | Signification |
|---|---|
| [`statut/à-trier`](https://git.home.gabin-simond.fr/gabins/homelab-config/issues?state=open&labels=150) | Créée, pas encore classée (type, priorité, effort) |
| [`statut/prêt`](https://git.home.gabin-simond.fr/gabins/homelab-config/issues?state=open&labels=151) | Classée, rien ne bloque, peut être prise |
| [`statut/en-cours`](https://git.home.gabin-simond.fr/gabins/homelab-config/issues?state=open&labels=152) | Quelqu'un (ou Claude) travaille dessus |
| [`statut/en-revue`](https://git.home.gabin-simond.fr/gabins/homelab-config/issues?state=open&labels=153) | Une PR est ouverte ; fusion automatique dès que la CI exigée est verte |
| [`statut/bloqué`](https://git.home.gabin-simond.fr/gabins/homelab-config/issues?state=open&labels=154) | Attend une autre issue (« Dépend de #N »), l'utilisateur ou un tiers |
| [`statut/à-vérifier`](https://git.home.gabin-simond.fr/gabins/homelab-config/issues?state=open&labels=155) | Fait, reste une vérification datée (cette nuit, dans une semaine) |
| [`statut/icebox`](https://git.home.gabin-simond.fr/gabins/homelab-config/issues?state=open&labels=156) | Idée non planifiée |
| *(fermée)* | Fait |

Et [**ce qui attend une action de l'utilisateur**](https://git.home.gabin-simond.fr/gabins/homelab-config/issues?state=open&labels=148) (étiquette `humain`).

## Titre

Format **`DOMAINE: phrase en français`**, sans point final. La phrase dit le **symptôme
observé** pour un bug, le **résultat attendu** sinon.

- Bon : `PENNY: redémarrage par le watchdog à 15:02` — `PULSE: retirer le relevé mémoire après le 9/11`
- Mauvais : `[BUG] souci`, `fix`, `Amélioration`

Domaines : `RÉSEAU`, `DNS`, `SAUVEGARDES`, `SÉCURITÉ`, `SUPERVISION`, `ALERTES`, `SERVICES`,
`PROXMOX`, `PENNY`, `MATÉRIEL`, `CI`, `DÉPS`, `DOC`, `IAC`, `COÛT`. Une epic nomme son
thème, sans préfixe.

## Étiquettes

Les familles `type/`, `priorité/`, `effort/` et `statut/` sont **exclusives** : Forgejo n'en accepte
qu'une par issue. C'est l'équivalent des champs Type, Priority et Effort des projets
GitHub.

| Famille | Valeurs | Règle |
|---|---|---|
| `type/` | `bug`, `tâche`, `évolution`, `epic` | Obligatoire, posée par le formulaire |
| `priorité/` | `urgente` (maintenant), `haute` (cette semaine), `moyenne` (ce mois-ci), `basse` | Une sur toute issue ouverte, sauf epic et icebox |
| `effort/` | `faible` (< 1 h), `moyen` (une session), `élevé` (plusieurs, ou dépend d'un tiers) | Estimation grossière, corrigée en cours de route |
| `machine/` | `penny`, `galahad`, `lancelot`, `réseau` | Autant que nécessaire |
| `statut/` | voir ci-dessus | Exclusive ; tenue à jour par Claude |
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
