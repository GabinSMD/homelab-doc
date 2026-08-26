# Migration MkDocs → Docusaurus — plan

**Date** : 2026-08-25
**Statut** : **MIGRATION TERMINEE** le 2026-08-26. Les 5 phases sont faites, le site public sert Docusaurus.
**Worktree** : `/mnt/ssd/homelab-docusaurus` (branche `migration-docusaurus`)
**Portée** : le dépôt `homelab-doc`, le site `homelab.gabin-simond.fr`, les workflows CI/CD
**Suite prévue** : pipeline Outline → Docusaurus (chantier séparé, à ne lancer qu'après bascule)

## Corrections apportees au plan le 2026-08-26

Cinq affirmations de ce plan se sont averees fausses a l'execution. Elles sont
corrigees ci-dessous plutot que reecrites en silence, parce que **c'est
l'inventaire qui etait faux, pas la mesure** : les chiffres venaient de `grep`
lances sans exclure les blocs de code ni ce document lui-meme.

1. **« 17 fichiers publies sans figurer dans la nav — tout `guides/` (4), tout
   `projet/` (11) ».** Faux, et pas une derive du corpus : des le commit
   `9c20a11` (phase 1), `mkdocs.yml` avait deja ces 15 entrees dans son bloc
   `nav`. Seules **3** pages sont hors nav : `operations/b2-cap-exceeded`,
   `operations/r2-migration`, et ce document. Consequence concrete :
   `sidebars.js` n'en listait que 38 sur 53, donc la bascule aurait supprime
   `guides/` et `projet/` du menu. **`compare-urls.sh` ne pouvait pas le voir** —
   les pages repondent toujours, elles ne sont plus atteignables au clic. Une
   comparaison d'URLs ne controle pas une navigation. Corrige en `a688a55`.

2. **« Le script traite aussi `++touche++` (2) et `==surligne==` (6) ».** Aucune
   de ces occurrences n'est du contenu. Les `==...==` sont **toutes** dans des
   blocs de code : regles udev de `architecture/os.md`
   (`ATTR{idProduct}=="1156"`), separateurs de sortie shell de `break-glass` et
   `hardening` (`== FIN ==`). Le reste vient des exemples de syntaxe de ce
   document. Les convertir aurait corrompu la configuration udev du SSD.

3. **« 7 emoji `:xxx:` a remplacer ».** Le grep generique attrapait `:https:`,
   `:bucket:`, `:gabin-homelab-backups:` — des fragments d'URL et de config
   rclone dans des blocs de code. Les vraies icones MkDocs Material sont **32**
   (`:material-check:` 9, `:material-close:` 4, `:octicons-alert-16:` 19) dans
   2 fichiers. Traitees par liste blanche explicite, jamais par motif generique.

4. **« Liens internes relatifs `.md` : 122 — neant, Docusaurus les resout
   nativement ».** Il les resout **par nom de fichier**. Passer `index`,
   `architecture/reseau` et `operations/break-glass` en `.mdx` a casse les 19
   liens qui pointaient dessus. Corrige en `64d80e1`, par resolution de chemin et
   non par recherche-remplacement — chaque section a son propre `index.md` non
   renomme, un `sed` sur `index.md` les aurait tous casses.

5. **« Docusaurus echoue deja sur un lien interne casse — c'est l'equivalent du
   `--strict` » (phase 4).** Faux avec la configuration ecrite en phase 1 :
   `onBrokenLinks` et `onBrokenAnchors` etaient sur `warn`. La CI n'aurait rien
   arrete. Les trois reglages (`onBrokenLinks`, `onBrokenAnchors`,
   `onBrokenMarkdownLinks`) sont passes sur `throw` en fin de phase 3.

**Et « 12 des 19 dangers MDX » dans `index.md` : il y en avait deux** —
l'attribut `markdown` et les `<br>`. Les autres balises HTML du bloc sont
valides en MDX des lors qu'elles sont fermees.

Ce qui a tenu exactement comme annonce : `trailingSlash: true` (aucune
redirection necessaire), `format: 'detect'` (aucune erreur MDX sur les 53
fichiers restes en `.md`), la des-indentation comme piege principal, et
`success` -> `tip`.

## Objectif

Remplacer MkDocs Material par Docusaurus v3, sans casser une seule URL publique,
et sans perdre la couverture du scanner de secrets en CI.

Le thème actuel n'est pas conservé : `overrides/` et `docs/stylesheets/extra.css`
sont abandonnés au profit du thème `classic` et d'un `src/css/custom.css` neuf.
Les trois polices (Instrument Serif, Inter Tight, JetBrains Mono) sont en revanche
reprises à l'identique.

## Inventaire mesuré

Chiffres relevés sur l'état du dépôt au 2026-08-25, pas des estimations.

| Élément | Volume | Difficulté |
|---|---|---|
| Fichiers Markdown | 53 (9 266 lignes), 54 depuis `incidents-recurrents` | — |
| Images en Markdown | **0** | néant |
| Liens internes relatifs `.md` | 122 | néant (Docusaurus les résout nativement) |
| Liens absolus internes | 0 | néant |
| Tableaux | 44 fichiers | néant (GFM) |
| Admonitions `!!!` | 74 dans 30 fichiers | mécanique |
| Admonitions repliables `??? success` | 21 | mécanique, cas particulier |
| Diagrammes Mermaid | 19 fichiers | configuration seule |
| Onglets `pymdownx.tabbed` | 8 marqueurs, **2 fichiers** | manuel |
| Dangers MDX hors blocs de code | 19, dont 12 dans `index.md` | manuel |
| `pymdownx.keys` / `mark` / emoji | 2 / 6 / 7 | manuel, trivial |

Extensions déclarées dans `mkdocs.yml` mais **jamais utilisées** — rien à migrer :
`pymdownx.snippets`, `attr_list`, `md_in_html` (sauf `index.md`), `pymdownx.inlinehilite`,
footnotes.

Le corpus est donc beaucoup plus propre que ce que la configuration laisse croire.
L'essentiel du travail tient dans un script et quatre fichiers à reprendre à la main.

## Décisions d'architecture

### 1. `trailingSlash: true` — la décision la plus importante

MkDocs sert `/architecture/hardware/`. Docusaurus, par défaut, sert
`/architecture/hardware`. Avec `trailingSlash: true` et l'arborescence de `docs/`
conservée à l'identique, **les 53 URLs sont préservées au caractère près**.

Conséquence : `@docusaurus/plugin-client-redirects` n'est pas nécessaire. Aucune
redirection à écrire, aucun lien externe cassé, aucune perte de référencement.
C'est la raison pour laquelle il ne faut renommer aucun fichier pendant la migration.
Les renommages, s'il y en a, viendront après, avec les redirections qui vont avec.

### 2. `markdown: { format: 'detect' }`

Par défaut Docusaurus v3 parse même les `.md` comme du MDX, et un `<version>` ou un
`{host}` en plein texte casse le build. Avec `detect`, les `.md` passent en CommonMark
pur et les `.mdx` gardent le JSX.

Les 53 fichiers restent en `.md`, sauf les trois qui ont besoin de composants
(`index.md`, `architecture/reseau.md`, `operations/break-glass.md`).

Cette ligne neutralise à elle seule 17 des 19 dangers MDX relevés.

### 3. Barre latérale explicite, pas autogénérée

`sidebars.js` doit recopier le bloc `nav:` de `mkdocs.yml`, entrée par entrée.

Motif : **17 fichiers sont publiés aujourd'hui sans figurer dans la nav** — tout
`guides/` (4), tout `projet/` (11), `operations/b2-cap-exceeded.md` et
`operations/r2-migration.md`. Avec une barre latérale autogénérée, ils
apparaîtraient tous d'un coup dans le menu.

Décision à prendre pendant la phase 1 : soit on reproduit l'état actuel (ces pages
restent accessibles par URL mais invisibles), soit on profite de la migration pour
les faire entrer dans la nav. Par défaut : **reproduire l'état actuel**, pour que la
migration ne change qu'une chose à la fois.

### 4. Autres réglages

- Plugin `docs` avec `routeBasePath: '/'`, plugin `blog` désactivé.
- `@docusaurus/theme-mermaid` + `markdown: { mermaid: true }`. Fonctionne aussi en
  mode CommonMark, puisqu'il s'agit d'un bloc de code clôturé.
- `editUrl` : **rester sur GitHub**, comme l'ancien `edit_uri`. Forgejo est bien la
  source de vérité, mais `git.home.gabin-simond.fr` est injoignable depuis le web
  public : un lien « Modifier cette page » mort serait pire que l'existant. À
  rejuger le jour où Forgejo sera exposé.
- `CNAME` : à placer dans `static/CNAME` pour qu'il finisse dans le build.
- Polices : `headTags` pour les deux `preconnect`, `stylesheets` pour la feuille
  Google Fonts — reprise telle quelle depuis `overrides/main.html`.

## Runtime

Aucun Node, npm ou bun n'est dans le `PATH` de penny. Deux options :

- **bun 1.3.12** est installé dans `/root/.bun/bin` (hors `PATH`). Suffisant pour un
  `bun run start` de prévisualisation, mais Docusaurus vise officiellement Node :
  attendre des aspérités. À ne pas utiliser comme runtime de référence.
- `apt install nodejs` fournit **18.20.4**, ce qui est **insuffisant** :
  Docusaurus 3.10.2 exige `node >= 20.0`. Le dépôt Debian 12 ne peut donc pas
  fournir le runtime. Il faudrait NodeSource ou nvm, c'est-à-dire une
  installation hors gestionnaire de paquets sur penny.

Le build qui fait foi reste celui de la CI. Le runner Forgejo (LXC 108) est en
`aarch64` : les paquets Docusaurus ont des binaires arm64, mais il faut prévoir un
cache npm, sans quoi chaque build réinstalle plusieurs centaines de Mo.

## Table des URLs

Correspondance 1:1 pour les 53 fichiers, à condition de conserver l'arborescence et
`trailingSlash: true` :

```
docs/index.md                     → /
docs/<section>/index.md           → /<section>/
docs/<section>/<page>.md          → /<section>/<page>/
docs/conditions.md                → /conditions/
docs/confidentialite.md           → /confidentialite/
```

**Zéro redirection requise.** Le contrôle de non-régression consiste à comparer la
liste des chemins de `site/` (build MkDocs actuel) à celle de `build/` (Docusaurus).
La différence attendue est vide.

## Phases

### Phase 0 — préparation — FAITE

Branche `migration-docusaurus`, isolée dans un **worktree dédié**
`/mnt/ssd/homelab-docusaurus` (voir le piège n°1 ci-dessous). Référence des URLs
archivée dans `.migration-urls-avant.txt`, produite par un MkDocs installé dans un
venv jetable (`/tmp/mkdocs-ref`, mkdocs 1.6.1 — il n'est pas installé sur penny).

`scripts/compare-urls.sh` rejoue la comparaison à la demande.

### Phase 1 — squelette — FAITE

Docusaurus **3.10.2**, écrit à la main plutôt que via `create-docusaurus` (le
gabarit officiel installe un blog et des docs de démonstration qu'il faudrait
ensuite supprimer). Dépendances installées par **bun 1.3.12**, qui a aussi produit
le build : 1265 paquets en 24 s, build client en 4,8 min sur le Pi.

Le squelette a été construit **directement contre les 54 fichiers réels**, et non
contre un fichier de test comme prévu : c'était plus informatif, et ça a donné la
liste de travail des phases 2 et 3 en une seule passe.

**Résultat : `bun run build` réussit, et `compare-urls.sh` rend « 56 URLs
identiques ».** Aucune erreur MDX — `format: 'detect'` fait bien son travail. Les
admonitions MkDocs non converties ne cassent rien : elles s'affichent en texte brut,
ce qui est un échec visible et non un échec de build.

### Phase 2 — conversion mécanique — FAITE

Un script Python unique, idempotent, qui traite les 30 fichiers à admonitions.

**Le piège n°1 est la dés-indentation.** Le corps d'une admonition MkDocs est
indenté de 4 espaces ; celui d'une admonition Docusaurus ne l'est pas. Si on se
contente de remplacer la ligne d'ouverture, tout le corps devient un bloc de code.

```
!!! warning "Titre"          →   :::warning[Titre]
    Corps indenté.                Corps dés-indenté.
                                  :::
```

Correspondance des types : `note`, `info`, `tip`, `warning`, `danger` passent tels
quels ; **`success` n'existe pas chez Docusaurus** et devient `tip`.

Les 21 blocs repliables `??? success` deviennent des `<details>` :

```html
<details>
<summary>Titre</summary>

Corps, avec une ligne vide de chaque côté pour rester du Markdown.

</details>
```

> À valider sur un fichier témoin avant de lancer les 21 : confirmer que le HTML brut
> passe bien en mode `format: 'md'`. Si ce n'est pas le cas, ces fichiers-là basculent
> en `.mdx`.

Le script traite aussi, dans la même passe : `++touche++` (2 occurrences) et
`==surligné==` (6). Les 7 emoji `:xxx:` sont à remplacer par le caractère littéral.

### Phase 3 — les quatre fichiers manuels — FAITE

1. **`index.md` → `index.mdx`.** Le bloc `<div class="hero" markdown>` (12 des 19
   dangers MDX) dépend de `md_in_html` et de `extra.css`, tous deux abandonnés.
   À réécrire comme un vrai composant, sur le nouveau thème.
2. **`architecture/reseau.md` → `.mdx`** — onglets `<Tabs>`/`<TabItem>`.
3. **`operations/break-glass.md` → `.mdx`** — onglets, plus des blocs de code
   indentés dans des admonitions : à vérifier après dés-indentation.
4. **`operations/b2-cap-exceeded.md`** — l'autolien `<https://…>` en plein texte est
   sauvé par `format: 'detect'`, mais c'est le fichier témoin idéal pour le vérifier.

### Phase 4 — CI/CD — FAITE

Dans `.github/workflows/` :

- Remplacer le job `mkdocs-build (strict)` par un build Docusaurus. Docusaurus
  échoue déjà sur un lien interne cassé — c'est l'équivalent du `--strict`.
- Remplacer l'installation Python de `deploy.yml` par Node + `npm ci`.
- **Ne toucher ni à `secret-scan-maison` ni à `markdown-lint`.** Le premier est la
  seule couverture secrets côté Forgejo ; il devra rester intact quand le pipeline
  Outline arrivera, puisque c'est lui qui verra le contenu rédigé hors du dépôt.
- Conserver les gardes `if: github.server_url == 'https://github.com'`.

### Phase 5 — bascule et vérification — FAITE

Comparer `/tmp/urls-avant.txt` au build Docusaurus. **Diff vide obligatoire avant
de fusionner.** Puis fusionner, laisser Pages déployer, et vérifier à la main la
page d'accueil, une page à Mermaid, une page à onglets et une page repliable.

## Pièges recensés

1. **Le dépôt de travail est partagé avec d'autres sessions.** Constaté en direct :
   pendant la phase 1, une autre session Claude a créé `operations/incidents-recurrents.md`,
   modifié `mkdocs.yml`, patché `sidebars.js`, puis committé — **sur la branche
   `migration-docusaurus`**, parce que `git checkout -b` change la branche du
   checkout partagé pour tout le monde. Son commit a été replacé sur `main` et la
   migration déplacée dans un worktree. Corollaire : toute la comparaison d'URLs
   est fausse si le corpus bouge sous les pieds — **regénérer la référence depuis
   la branche de migration, jamais depuis `main`**.
2. **Dés-indentation des corps d'admonition** — silencieux, transforme la prose en
   blocs de code. Le plus coûteux si on le rate.
3. **`trailingSlash`** — oublié, il casse les 53 URLs d'un coup.
4. **`success` → `tip`** — sinon 26 admonitions rendues en texte brut.
5. **Renommer un fichier « tant qu'on y est »** — chaque renommage est une URL morte.
   Interdit pendant la migration.
6. **Les 17 pages hors nav** — décision consciente à prendre, pas à subir.
7. **Le cache npm sur le runner arm64** — sans lui, chaque build réinstalle tout.

## Bonus : 12 ancres cassées, invisibles depuis toujours

Docusaurus signale **12 liens vers des ancres inexistantes** (`#…`) que MkDocs n'a
jamais relevés — il ne valide pas les ancres sans `validation.anchors`, non
configuré ici. Ce ne sont donc pas des régressions de migration mais des liens
morts déjà en production, dont trois pointent vers `/architecture/reseau/#les-dns-rewrites-la-piece-cle`.

`onBrokenAnchors` est sur `warn` le temps de la migration. À passer sur `throw`
en fin de phase 3, une fois les 12 corrigés — sinon le garde-fou ne sert à rien.

## Ce que ce plan ne couvre pas

Le pipeline Outline → Docusaurus. Il se branche après la bascule, sur un site qui
build déjà. Rien dans ce plan ne doit l'anticiper, sauf un point : les fichiers
générés depuis Outline devront être commités dans ce dépôt, pour que
`secret-scan-maison` les voie.

## Bascule : ce qui a ete verifie le 2026-08-26

Porte franchie dans cet ordre, chaque etape conditionnant la suivante :

1. `bun run build` en local : succes, 0 erreur, 0 avertissement.
2. `compare-urls.sh` : **57 URLs identiques**, diff vide.
3. Fusion en fast-forward (9 commits), push Forgejo puis GitHub.
4. CI GitHub verte en **58 s** — `bun install --frozen-lockfile` + `bun run build`
   fonctionne hors du Pi, ou le meme build prend 13 min. L'ecart au plan sur
   `npm ci` est donc valide par l'usage.
5. Deploy Pages vert en 1 min 11.
6. Verification sur le site EN LIGNE, pas sur le build local : hero rendu,
   2 onglets, 21 repliables, 13 admonitions sur `depannage`, 19 icones warning
   sur `monitoring`, l'ancre corrigee `#réseaux-docker--isolation-et-icc`
   presente, et les 4 pages `guides/` + 11 pages `projet/` de retour dans la
   barre laterale.

Deux faux signaux rencontres, notes parce qu'ils se reproduiront :

- **`compare-urls.sh` a rendu « OK — 57 URLs identiques » sur un build en
  echec.** Docusaurus ecrit tout le HTML puis valide les liens en dernier : un
  build tombe sur `throw` laisse un `build/` complet et comparable. Le script
  refuse desormais un build perime, et exige d'etre enchaine en `&&` derriere le
  build — seul le code de retour du build peut prouver quelque chose.
- **Mermaid parait absent du HTML** : c'est normal, Docusaurus ne pre-rend pas
  les diagrammes cote serveur. La source vit dans les bundles JS
  (`build/assets/js/`). Ne pas conclure a une regression sur un `grep` du HTML.

## Reste a decider (hors migration)

- `mkdocs.yml`, `overrides/` et `docs/stylesheets/extra.css` sont du poids mort,
  volontairement conserves : `mkdocs.yml` reste le seul moyen de regenerer la
  reference d'URLs pour recontroler une bascule future.
- `markdown-lint` a pour glob `docs/**/*.md` : les 3 fichiers passes en `.mdx`
  ne sont plus lintes. Job `continue-on-error`, enjeu faible.
- Le worktree `/mnt/ssd/homelab-docusaurus` est conserve : c'est le seul endroit
  qui porte `node_modules` pour une previsualisation locale. Sa branche est
  fusionnee — ne pas le prendre pour du travail en cours.
- Passer la CI a Node + `npm ci` demandera de generer un `package-lock.json` sur
  une machine qui a Node.
