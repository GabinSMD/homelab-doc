# Dashboard Homepage — thèmes, fonds et liquid glass

**Date** : 2026-08-04
**Statut** : validé, en implémentation
**Portée** : `homelab-config/homepage/` (`settings.yaml`, `custom.css`, `custom.js`)
**Prérequis** : la refonte du 2026-08-03 (voir la spec précédente)

## Objectif

Trois réglages accessibles depuis le dashboard : bascule clair/sombre, choix de
fond parmi trois modes, et des cartes en verre translucide laissant voir le fond
sans sacrifier la lisibilité.

## Ce qui est déjà natif dans Homepage

L'exploration du conteneur a montré que l'essentiel existe déjà. Le travail
custom est plus étroit qu'il n'y paraît.

**`cardBlur`** applique `backdrop-blur-*` aux cartes de service, aux favoris et
à la barre d'onglets. Le liquid glass est donc une ligne de configuration.

**La bascule clair/sombre existe**, mais elle est doublement invisible :

```jsx
<div id="footer">
  <div id="style">
    {!settings?.color && <ColorToggle/>}
    {!settings.theme  && <ThemeToggle/>}
```

Elle ne se rend **que si le réglage correspondant est absent**. Or `settings.yaml`
fixe `theme: dark` et `color: slate`, donc les deux boutons ne sont pas générés.
Et même générés, ils vivent dans `#footer`, que `custom.css` masque.

**`background:`** accepte `image`, `blur`, `saturate`, `brightness`, `opacity` —
c'est le mode image.

Le seul mode sans équivalent natif est le fond **dynamique**.

## Faits mesurés

Deux vérifications faites en maquette avant d'écrire cette spec, parce que les
deux conditionnaient le design.

**`backdrop-filter` survit à `transform: scale()`.** Le mode ajusté à l'écran
applique un `scale()` sur `#inner_wrapper` ; le « backdrop » devient donc le
groupe transformé, et les moteurs divergent sur ce point. Vérifié :
`transform ancetre=scale(0.830464)` avec un flou visuellement effectif. Le
liquid glass est compatible avec l'ajustement automatique.

**Le verre seul ne suffit pas à la lisibilité.** Avec `blur(12px)` et une teinte
à `rgba(20,22,34,0.42)` par-dessus un fond très contrasté, les libellés de
métriques (`VM`, `LXC`, `ROUTEURS`) deviennent illisibles. Il faut agir sur les
trois leviers à la fois : flou plus large, teinte plus opaque, et assombrissement
de l'image elle-même.

## Unité 1 — Bascule clair/sombre

Retirer `theme:` et `color:` de `settings.yaml` pour que les deux boutons se
rendent. Homepage persiste le choix dans `localStorage` (`theme-mode`,
`theme-color`).

`#footer` sort du flux : `position: absolute`, calé en haut à droite. Le faire
réapparaître en flux normal coûterait environ 40 px de hauteur, sur les 48 px de
marge dont dispose l'iPad — inacceptable. En absolu, le coût est nul.
`#version` reste masqué.

## Unité 2 — Palette claire

Tailwind est en stratégie `class` : le mode clair est l'**absence** de `.dark`
sur `<html>`. Les surcharges sont donc scopées `html:not(.dark)`.

C'est le poste le plus lourd, parce que tous les jetons actuels sont accordés au
sombre : fond `#070810`, surfaces en blanc translucide, lueurs, liserés de
lumière interne. En clair il faut inverser la logique : surfaces en **noir**
translucide, ombres qui redeviennent de vraies ombres portées, halos atténués.

L'accent indigo `#8B96F7` est conservé — il tient sur les deux fonds — mais ses
variantes translucides sont réaccordées.

Contrainte : conserver au minimum le même contraste texte/surface qu'en sombre.

## Unité 3 — Trois modes de fond

Contrôle segmenté à trois positions, construit par `custom.js`, placé à côté de
la bascule de thème. L'état vit dans `localStorage` et se matérialise en
attribut `data-bg` sur `<html>`, ce qui laisse tout le rendu au CSS.

| Mode | Rendu |
|---|---|
| `statique` | les deux halos radiaux fixes actuels |
| `dynamique` | dégradé dérivé de `data-daypart`, étendu de 2 à 5 phases |
| `image` | le `#background` natif de Homepage, affiché uniquement dans ce mode |

Le mode dynamique **n'anime rien**. Il est statique à chaque instant et ne change
qu'au passage d'une phase à l'autre. C'est la raison pour laquelle il a été
retenu contre un dégradé animé : sur un écran allumé en continu, une animation
en boucle est un repaint permanent — l'argument qui avait fait retirer l'aurora
lors de la refonte précédente reste valable.

Les cinq phases : aube, matin, plein jour, crépuscule, nuit. Elles réutilisent
l'attribut `data-daypart` déjà posé par `custom.js` pour l'atténuation nocturne,
plutôt que d'ajouter une mécanique parallèle.

Le mode image lit `/images/<fichier>` — l'image se dépose dans
`homepage/images/`, que Homepage sert sous `/images/`. Si le fichier est absent,
`#background` ne rend rien et l'affichage retombe sur le fond statique.

## Unité 4 — Liquid glass

`cardBlur: md` dans `settings.yaml`.

Les mesures ci-dessus imposent des réglages différents selon le mode. Au-dessus
d'un dégradé (statique ou dynamique), la teinte actuelle suffit. Au-dessus d'une
image, `html[data-bg="image"]` relève `--card-top` et `--card-bottom` vers 0.6+,
et l'image est assombrie côté Homepage via `background.brightness` autour de 40.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `homepage/settings.yaml` | retrait de `theme:`/`color:`, ajout de `cardBlur:` et `background:` |
| `homepage/custom.css` | palette claire, modes de fond, ajustements de verre, repositionnement du pied de page |
| `homepage/custom.js` | contrôle des modes de fond, extension de `data-daypart` à 5 phases |
| `homepage/images/` | répertoire pour l'image de fond (facultatif) |

## Validation

Rendu en maquette dans les six combinaisons qui comptent : clair et sombre
croisés avec les trois modes de fond. La maquette charge `custom.css` avant la
feuille Tailwind, comme en production, et simule le pointeur grossier de l'iPad.

Vérifier en particulier que la hauteur totale ne dépasse pas le plafond de
934 px mesuré pour l'iPad Pro 11" — le contrôle en absolu ne coûte rien, mais
une palette claire peut modifier des hauteurs de texte.

Validation finale sur l'appareil par l'utilisateur : le rendu du
`backdrop-filter` de WebKit n'est pas celui de Chromium, et la lisibilité du
verre est un jugement qui se fait à l'œil, sur le mur.

## Écarté volontairement

**La météo dans le fond** : une dépendance et un point de rupture de plus pour un
gain marginal.

**L'image distante changeant chaque jour** (Unsplash, Bing, APOD) : dépendance
réseau au chargement d'un écran qui doit rester fiable.

**Un fond réagissant à l'état du homelab** : séduisant, mais contraire à la règle
tenue depuis la refonte — la couleur ne parle que pour l'état d'un service. Un
fond ambré diluerait le signal que portent les cartes.
