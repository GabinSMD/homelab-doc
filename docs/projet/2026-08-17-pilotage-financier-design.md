# Pilotage financier personnel — design

**Date** : 2026-08-17
**Statut** : design validé, spec en attente de relecture
**Portée** : un nouveau service auto-hébergé (LXC sur galahad), une couche de
dashboards Grafana, un fichier de configuration versionné dans `homelab-config`

## Objectif

Suivre les dépenses, piloter les crédits, mesurer le patrimoine et projeter
l'épargne à terme — automatiquement, et consultable depuis le téléphone à tout
moment.

Quatre piliers, dont un seul est couvert par les outils du marché :

| Pilier | Couvert par |
|---|---|
| Dépenses et budget mensuel | Firefly III |
| Crédits (capital restant dû, amortissement) | Firefly III + couche maison |
| Investissements (répartition, patrimoine) | saisie mensuelle + couche maison |
| Projection d'épargne à terme | **couche maison uniquement** |

La valeur du projet est dans le quatrième. Les trois premiers sont le socle qui
le rend possible.

## Origine

La demande part d'une vidéo Instagram présentant « Glow-up ton budget »
(@thesmartandrichbabe) : un fichier HTML unique, ouvert en local, alimenté par
un CSV téléchargé à la main depuis sa banque.

Cet outil est **un outil de budget mensuel**, pas de pilotage patrimonial. Il ne
fait ni crédits, ni valorisation d'investissements, ni projection. Il n'est donc
pas retenu, mais cinq de ses idées sont reprises telles quelles :

1. le **budget type** confronté au mois réel, avec l'écart affiché
2. la **détection de dépense inhabituelle** (« Transports, +89 € que prévu »)
3. la **capacité d'épargne** comme indicateur de tête
4. **reste à vivre** et **reste à attribuer**, plus lisibles qu'un solde
5. le montant **annualisé** sous chaque dépense mensuelle (60 €/mois = 720 €/an)

Son argument de confidentialité — un fichier local, pas d'application qui
« pompe les données » — ne s'applique pas ici : l'auto-hébergement répond au même
besoin, avec en prime l'accès mobile et la sauvegarde.

## Ce qui a été écarté

**Actual Budget** — plus vivant que Firefly III (28,2k étoiles, 460+
contributeurs, releases mensuelles ininterrompues depuis trois ans, contre un
mainteneur principal côté Firefly III). Écarté malgré ça, pour trois raisons de
besoin :

- il **ne modélise pas la dette** ; le pilotage des crédits est impossible
- son stockage est local-first (SQLite compilé en WASM) ; la voie vers Grafana
  passe par un exporteur Prometheus communautaire aux métriques figées, alors que
  Firefly III expose un **Postgres interrogeable en SQL arbitraire**
- sa méthode par enveloppes est un rituel mensuel d'allocation, alors que la
  demande est de l'observation et de la projection

Le facteur bus de Firefly III est réel mais survivable : les données sont dans un
Postgres ouvert, exportables à tout moment.

**Le sur-mesure intégral** — écarté : le travail pénible (dédoublonnage,
catégorisation, réconciliation) est déjà résolu, et ce n'est pas là qu'est la
valeur.

**Ghostfolio** — reporté en phase 5. Firefly III ne suit pas les
investissements, c'est documenté et assumé par son auteur. La saisie mensuelle
manuelle suffit pour une courbe de patrimoine et une répartition honnêtes.

## État constaté

Relevé le 2026-08-17, pas supposé.

| | |
|---|---|
| RAM libre sur penny | 3,0 Gi sur 7,7 (4,7 utilisés) |
| Espace libre `/mnt/ssd` | 430 Go sur 469 |
| Datasources Grafana (LXC 101) | **une seule**, Loki |
| Firefly III stable | v6.6.6, 2026-07-01 ; builds de dev au 2026-08-04 |
| Banques concernées | BoursoBank, Crédit Agricole, Hello bank! |
| Agrégation DSP2 | GoCardless fermé aux nouveaux particuliers → Enable Banking |

Réutilisable en l'état : Traefik (DNS-01 Cloudflare), Authelia, Grafana, ntfy,
restic vers R2, PBS, sops.

## Architecture

### Hébergement

Un LXC dédié **sur galahad**. Ni penny (3 Gi de RAM libres, historique de
déconnexions SSD), ni lancelot (paniques noyau avec suspicion matérielle sur
RAM non-ECC). Pour des données financières, le nœud sain est le bon choix.

Contenu, en Compose versionné dans `homelab-config` :

| Composant | Rôle |
|---|---|
| `firefly-iii` | l'application, source de vérité |
| `postgres` | la base, et la source des dashboards |
| `firefly-importer` | le connecteur bancaire |
| `cron` | déclencheur quotidien des **deux** tâches |

Deux crons distincts sont nécessaires : un pour Firefly III, un pour l'importer.
N'en configurer qu'un est l'erreur la plus fréquente.

### Accès

Traefik en frontal, certificat DNS-01 Cloudflare, **Authelia devant**. Accès
mobile par Tailscale, page épinglable sur l'écran d'accueil iOS.

**Tout passe derrière Authelia, sans exception — y compris l'API.**

Une première version de ce design excluait `/api` du middleware `forwardAuth`,
au motif que l'importer appelle cette API et qu'un 302 tuerait l'import en
silence. C'est faux dans notre topologie : **l'importer tourne dans le même LXC
et la même pile Compose**, donc il joint Firefly III par le réseau Docker interne
(`http://app:8080`), sans jamais traverser Traefik ni Authelia.

Exposer publiquement une route `/api` authentifiée par simple jeton créerait donc
une surface d'attaque sans contrepartie. Si une application mobile tierce devient
souhaitable, la route `/api` sera ajoutée **restreinte par `IPAllowList` à la
plage Tailscale** — jamais en accès public.

### Sauvegardes

Deux niveaux, parce qu'un instantané de LXC ne garantit pas une base cohérente :

- `pg_dump` quotidien sur le SSD, repris par restic vers R2
- le LXC ajouté au job PBS

Ce dépôt entre dans le **drill de restauration mensuel** au même titre que les
autres.

### Observabilité

Datasource Postgres ajoutée à Grafana en **provisioning fichier versionné**,
jamais par mutation SQL de `grafana.db` — qui serait écrasée au redémarrage.

## Modèle de données

### Affectation des objets Firefly III

| Objet | Usage | Exemple |
|---|---|---|
| Comptes d'actif | ce que tu possèdes | compte courant, Livret A, PEA |
| Passifs | ce que tu dois | prêt immo, prêt conso |
| Catégories | le poste de dépense, fin | Alimentation, Transport, Loyer |
| Budgets | le budget type mensuel | Alimentation : 400 €/mois |
| Tags | le transversal, ponctuel | `vacances-2026`, `à-confirmer` |

Le couple budget mensuel ↔ dépenses réelles de la catégorie **est** l'écran
« écart vs budget type ». Il sort d'une requête, pas d'un développement.

**Piège : une carte de crédit se modélise en compte d'actif, pas en passif.**
C'est documenté et contre-intuitif. Se tromper fausse tout le patrimoine net et
impose de repartir de zéro.

### La classe 50/30/20 porte sur la catégorie

Pas sur la transaction. « Alimentation » est un besoin, toujours. Une table de
correspondance `catégorie → classe` d'une vingtaine de lignes, contre des
milliers de tags à maintenir.

Conséquence : reclasser un poste recalcule tout l'historique instantanément, et
changer de méthode (50/30/20, 80/20, base zéro) ne touche aucune transaction.

### Crédits

Un passif par crédit dans Firefly III, qui suit le capital restant dû réel.

**Firefly III accepte le taux d'intérêt mais ne calcule pas l'échéancier** :
chaque échéance devrait être décomposée à la main entre capital et intérêts. Sur
240 échéances, c'est intenable. Le **tableau d'amortissement est donc généré**
par la couche maison, à partir de quatre paramètres stockés en YAML : taux,
durée, date de première échéance, mensualité.

Trois sorties qu'aucun outil du marché ne fournit :

- capital restant dû **réel confronté au théorique** (un écart signale une erreur
  de saisie ou un remboursement anticipé non enregistré)
- cumul des intérêts déjà payés
- simulation de remboursement anticipé, qui alimente l'arbitrage
  **remboursement anticipé vs investissement** — la comparaison du taux du crédit
  au rendement attendu de l'allocation

### Investissements, et le piège de la réévaluation

Phase 1 : un compte d'actif par support, valeur ajustée mensuellement à la main.

En partie double, **modifier un solde exige une écriture**, et cette écriture
ressemble à une dépense. Si le PEA perd 800 € en mars, le tableau de bord
afficherait 800 € de dépenses supplémentaires : capacité d'épargne absurde,
budget en apparence explosé, et une soirée perdue à chercher la fuite.

**Parade** : les réévaluations passent par une catégorie dédiée
`revalorisation`, **exclue par construction de tout écran de dépense**. Elle ne
compte que dans le patrimoine.

### Ce que Firefly III ne stockera jamais

Six données vivent dans un **YAML versionné dans `homelab-config`** :

1. les objectifs datés — montant, échéance, libellé
2. l'allocation cible par classe d'actif
3. les paramètres de chaque crédit
4. la correspondance catégorie → classe
5. l'hypothèse de rendement des projections
6. les dates de consentement bancaire, une par connexion

Un chargeur idempotent les recopie dans un **schéma Postgres séparé**,
`pilotage`, que Grafana joint aux tables de Firefly III.

Le schéma séparé n'est pas cosmétique : **aucune écriture dans les tables de
Firefly III**, donc ses migrations de version ne peuvent ni casser les
dashboards, ni écraser ces données.

Bénéfice de bord : les objectifs financiers passent en revue de code et gardent
un historique git.

## Flux de données

### Quotidien

Le cron réveille l'importer, qui interroge Enable Banking et pousse les nouvelles
opérations. L'importer applique les règles automatiquement et saute les doublons.

Les règles s'appliquent **par groupes, dans l'ordre** :

1. **virements internes** → convertis en *transferts*
2. **échéances de crédit** → décomposées capital / intérêts
3. **marchands récurrents** → catégorie et budget
4. **filet** → tag `à-confirmer`

**Le groupe 1 est le plus important du système.** Un virement de 200 € du compte
courant vers le Livret A est présenté par la banque comme un débit. Sans règle,
c'est enregistré en **dépense** : l'épargne est comptée comme de la consommation.
Et si les deux comptes sont importés, les 200 € comptent **deux fois** dans le
patrimoine. Un transfert, lui, ne bouge pas le patrimoine net.

Avec trois banques, cela vaut aussi pour les virements **entre banques**, qui
apparaissent des deux côtés.

### Catégorisation

**Firefly III n'a aucune IA embarquée, par choix de conception** : moteur à base
de règles définies par l'utilisateur, prévisible et auditable, sans accès d'un
tiers aux transactions. Une demande d'évolution LLM existe (issue #9753), non
livrée.

Environ 90 % des lignes sont des marchands récurrents au libellé stable, mieux
traités par une règle déterministe : gratuite, instantanée, sans dérive.

Un catégoriseur LLM intervient **uniquement sur le résidu `à-confirmer`**, et
**propose** au lieu de décider : la proposition arrive taguée, un panneau Grafana
liste l'attente, et chaque validation devient une nouvelle règle — donc le volume
soumis décroît mois après mois.

Justification du garde-fou : une règle qui échoue **échoue visiblement** (la
transaction reste sans catégorie). Un LLM qui se trompe **échoue invisiblement** :
il range « Boulangerie Martin » en Transport, c'est plausible, personne ne le
voit, et l'historique est faux là où l'on ne regarde jamais.

Coût à ce volume (≈ 20 libellés inconnus par mois) : **de 0,25 $ à 1,30 $ par
an** selon le modèle. L'écart étant du bruit, le choix se fait sur la qualité,
pas sur le prix.

Deux réserves : la clé API est un **service externe dans un chemin automatisé**
(si le solde tombe à zéro, la catégorisation doit s'arrêter **bruyamment**), et
les libellés partent chez un tiers — c'est le seul point de sortie de données
financières. Repli entièrement local si cela gêne : **FFIIITC**, classificateur
bayésien naïf qui apprend des corrections, moins bon sur les marchands inconnus.

### Mensuel

Saisie manuelle de la valeur de chaque support, cinq minutes. **Notification ntfy
le 1er du mois** : sans rappel, la courbe de patrimoine se fige à plat, et une
ligne droite ressemble à de la stabilité, pas à une panne.

### Configuration

Push sur `homelab-config` → le chargeur relit le YAML au cron suivant → schéma
`pilotage`. Idempotent, rejouable sans risque.

## Garde-fous

Un tableau de bord financier périmé est plus dangereux qu'un tableau de bord
absent, parce qu'on le croit.

### Deux alertes distinctes sur l'import, et il faut les deux

| Alerte | Seuil | Ce qu'elle attrape |
|---|---|---|
| Le job a-t-il tourné ? | 36 h sans signal | LXC tombé, conteneur mort, cron désactivé |
| Le job rapporte-t-il ? | 7 j sans transaction | consentement expiré, jeton révoqué, API changée |

La première ne couvre pas la seconde. C'est le motif exact des 251 h de
sauvegardes mortes de 2026-08-03 : le mécanisme tournait et ne produisait rien.

**Ces deux alertes sont par connexion bancaire, pas globales.** Avec trois
banques, une alerte globale est inutile : le Crédit Agricole continue de déverser
des transactions et **masque** BoursoBank mort depuis trois semaines. Même piège
que `lancelot` resté à terre onze jours — un signal venu d'ailleurs masque le
silence.

### Les autres

| Alerte | Déclenchement |
|---|---|
| Consentement bancaire | J-14 avant expiration, par connexion |
| Capital restant dû | écart réel / théorique au-delà d'un seuil |
| Arriéré de validation | > 15 transactions en attente depuis > 15 jours |

L'arriéré compte : sans lui, le résidu grossit et les répartitions sont fausses
d'un quart sans le dire.

### Règle de conception

**Ces alertes doivent être silencieuses en régime normal.** Si l'une se déclenche
plus d'une fois par mois en croisière, c'est le seuil qui est mauvais — on le
corrige au lieu de s'y habituer.

## Ce que le système ne fera pas

- **Supprimer la réauthentification bancaire.** Le consentement DSP2 expire
  (Enable Banking : 180 jours par défaut), les banques françaises passent par
  redirection ou bascule vers leur appli. Quelques fois par an, par banque, c'est
  réglementaire et non contournable.
- **Ressembler au template de la vidéo.** Grafana affiche des chiffres justes
  dans une interface de supervision. Une page maison plus soignée pour le budget
  du mois est envisageable en option, après trois mois de données réelles.
- **Conseiller une allocation.** Le système mesure l'écart à la cible que
  l'utilisateur fixe ; il ne dit pas quoi acheter.
- **Valoriser un portefeuille au cours du marché** avant la phase 5.

## Découpage en phases

Chaque phase est utile seule.

| # | Phase | Contenu | Utile seule parce que |
|---|---|---|---|
| 1 | Socle | LXC, Compose, Postgres, Traefik, Authelia, sauvegardes | saisie et catégorisation manuelles possibles |
| 2 | Alimentation | Enable Banking par banque, repli CSV, règles 1 à 4 | plus de saisie |
| 3 | Crédits | passifs, amortissement généré, capital restant dû | pilotage des crédits opérationnel |
| 4 | Pilotage | datasource Postgres, patrimoine, trajectoire, allocation | l'objectif du projet |
| 5 | Investissements | Ghostfolio, si la saisie manuelle frustre | optionnel, décidé sur usage réel |

Les garde-fous ne sont pas une phase : chacun est livré avec le flux qu'il
surveille.

## Points ouverts

À résoudre avant les phases concernées.

| Question | Bloque | Statut |
|---|---|---|
| Caisse régionale du Crédit Agricole | phase 2 | à préciser |
| BoursoBank couvert par Enable Banking ? | phase 2 | non confirmé en doc |
| Hello bank! : établissement distinct ou sous BNP ? | phase 2 | à vérifier |
| Limites exactes de l'offre gratuite Enable Banking | phase 2 | page tarifs en 404 |
| Horizon de projection (3 ans, 10 ans, retraite ?) | phase 4 | non fourni |
| Contenu actuel de l'épargne | phase 4 | non fourni |
| Objectifs datés et allocation cible | phase 4 | à poser par l'utilisateur |

Les deux dernières lignes sont la condition d'existence des écrans de la phase 4 :
sans chiffres déclarés, ils sont vides et le projet retombe sur une simple courbe
de trajectoire.

## Sources

- [Firefly III — ce que ce n'est pas](https://docs.firefly-iii.org/explanation/more-information/what-its-not/)
- [Firefly III — gérer les passifs](https://docs.firefly-iii.org/how-to/firefly-iii/finances/liabilities/)
- [Firefly III — automatiser l'import](https://docs.firefly-iii.org/how-to/data-importer/import/automated/)
- [Firefly III — GoCardless (fermé aux nouveaux)](https://docs.firefly-iii.org/how-to/data-importer/import/gocardless/)
- [Enable Banking — spécificités France](https://enablebanking.com/docs/markets/fr/)
- [Actual Budget — synchronisation bancaire](https://actualbudget.org/docs/advanced/bank-sync/)
- [Demande d'intégration LLM dans Firefly III (#9753)](https://github.com/firefly-iii/firefly-iii/issues/9753)
