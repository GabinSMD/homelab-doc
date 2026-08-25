# Migration MkDocs → Docusaurus — plan

**Date** : 2026-08-25
**Statut** : plan validé, non démarré
**Portée** : le dépôt `homelab-doc`, le site `homelab.gabin-simond.fr`, les workflows CI/CD
**Suite prévue** : pipeline Outline → Docusaurus (chantier séparé, à ne lancer qu'après bascule)

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
| Fichiers Markdown | 53 (9 266 lignes) | — |
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

### Phase 0 — préparation

Branche `migration-docusaurus`. Construire le site MkDocs actuel et **archiver la
liste de ses URLs** : c'est la référence contre laquelle tout sera comparé.

```bash
mkdocs build && find site -name '*.html' | sed 's|^site||;s|/index\.html$|/|' | sort > /tmp/urls-avant.txt
```

### Phase 1 — squelette

Créer le projet Docusaurus, appliquer les quatre décisions ci-dessus, écrire
`sidebars.js` depuis le `nav:` actuel, et vérifier qu'il build avec **un seul**
fichier de test. Ne pas encore toucher aux 53 fichiers.

### Phase 2 — conversion mécanique

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

### Phase 3 — les quatre fichiers manuels

1. **`index.md` → `index.mdx`.** Le bloc `<div class="hero" markdown>` (12 des 19
   dangers MDX) dépend de `md_in_html` et de `extra.css`, tous deux abandonnés.
   À réécrire comme un vrai composant, sur le nouveau thème.
2. **`architecture/reseau.md` → `.mdx`** — onglets `<Tabs>`/`<TabItem>`.
3. **`operations/break-glass.md` → `.mdx`** — onglets, plus des blocs de code
   indentés dans des admonitions : à vérifier après dés-indentation.
4. **`operations/b2-cap-exceeded.md`** — l'autolien `<https://…>` en plein texte est
   sauvé par `format: 'detect'`, mais c'est le fichier témoin idéal pour le vérifier.

### Phase 4 — CI/CD

Dans `.github/workflows/` :

- Remplacer le job `mkdocs-build (strict)` par un build Docusaurus. Docusaurus
  échoue déjà sur un lien interne cassé — c'est l'équivalent du `--strict`.
- Remplacer l'installation Python de `deploy.yml` par Node + `npm ci`.
- **Ne toucher ni à `secret-scan-maison` ni à `markdown-lint`.** Le premier est la
  seule couverture secrets côté Forgejo ; il devra rester intact quand le pipeline
  Outline arrivera, puisque c'est lui qui verra le contenu rédigé hors du dépôt.
- Conserver les gardes `if: github.server_url == 'https://github.com'`.

### Phase 5 — bascule et vérification

Comparer `/tmp/urls-avant.txt` au build Docusaurus. **Diff vide obligatoire avant
de fusionner.** Puis fusionner, laisser Pages déployer, et vérifier à la main la
page d'accueil, une page à Mermaid, une page à onglets et une page repliable.

## Pièges recensés

1. **Dés-indentation des corps d'admonition** — silencieux, transforme la prose en
   blocs de code. Le plus coûteux si on le rate.
2. **`trailingSlash`** — oublié, il casse les 53 URLs d'un coup.
3. **`success` → `tip`** — sinon 26 admonitions rendues en texte brut.
4. **Renommer un fichier « tant qu'on y est »** — chaque renommage est une URL morte.
   Interdit pendant la migration.
5. **Les 17 pages hors nav** — décision consciente à prendre, pas à subir.
6. **Le cache npm sur le runner arm64** — sans lui, chaque build réinstalle tout.

## Ce que ce plan ne couvre pas

Le pipeline Outline → Docusaurus. Il se branche après la bascule, sur un site qui
build déjà. Rien dans ce plan ne doit l'anticiper, sauf un point : les fichiers
générés depuis Outline devront être commités dans ce dépôt, pour que
`secret-scan-maison` les voie.
