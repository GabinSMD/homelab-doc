# Homepage (dashboard)

Tableau de bord du homelab, concu pour une **tablette murale lue debout a un
metre** — le PC n'est que la cible secondaire. Cet ordre explique la plupart des
choix ci-dessous : quand les deux usages s'opposent, c'est le mur qui gagne, et
le desktop est resserre ensuite.

## Acces

| | |
|---|---|
| URL | `https://home.gabin-simond.fr` |
| Host | penny (Docker) |
| Image | `ghcr.io/gethomepage/homepage` (digest epingle) |
| Auth | ForwardAuth Authelia |
| Config | `homelab-config/homepage/` (`settings.yaml`, `services.yaml`, `bookmarks.yaml`, `custom.css`, `custom.js`) |

Les fichiers sont montes en lecture-ecriture dans `/app/config` et relus a
chaque requete pour les services, les favoris et les widgets. **Les reglages de
page, eux, ne le sont pas** : voir « Le piege a connaitre » plus bas.

## Comment la page tient a l'ecran

`custom.js` applique un `transform: scale(z)` sur `#inner_wrapper`, avec `z`
calcule pour que le contenu tienne exactement dans la hauteur de la fenetre. Le
plancher est a `z = 0.80` : en dessous, on rend la main au defilement plutot que
de livrer une interface qu'on ne peut plus toucher.

Consequence a retenir avant toute modification : **la hauteur est la ressource
rare**. Ajouter 40 px de contenu ne fait pas defiler la page, ca reduit `z`,
donc ca rend TOUT plus petit, donc moins lisible a un metre. Budget mesure sur
iPad paysage (1194x834) :

| Onglet | Contenu | `z` | Marge avant le plancher |
|---|---|---|---|
| Supervision | 956 px | 0.868 | 81 px |
| Applications | 970 px | 0.855 | 67 px |

Le PC (3440x1355) est a `z = 0.988` avec 320 px de marge : il n'est jamais
contraint, c'est la tablette qui dicte.

Les cibles tactiles et les planchers typographiques sont ecrits en
`calc(<valeur> / var(--fit-scale))` : c'est ce qui leur conserve une taille
**physique** constante malgre la reduction d'echelle.

## Les regles a ne pas casser

Toutes les valeurs ci-dessous sont mesurees, pas estimees. Si une modification
les degrade, elle est a revoir.

**Lisibilite a 1 m.** Le seuil de lecture confortable est de 10 minutes d'arc.
Les libelles de metriques sont a 12.3′, les valeurs a 29′, les noms de service a
15.6′. Un libelle a 10.5 px de base tombait a 7.9′ : c'est la taille de BASE qui
etait calee pour un bureau, pas l'echelle qui etait fautive.

**Contraste WCAG AA, dans les deux regimes de palette.** La palette s'attenue la
nuit (`data-daypart="nuit"`), et c'est la que le contraste se degradait le plus.

| Element | Jour | Nuit | Seuil |
|---|---|---|---|
| Libelle de metrique | 5.00:1 | 4.57:1 | 4.5 |
| Description | 5.99:1 | 4.67:1 | 4.5 |
| Onglet inactif | 7.56:1 | 4.58:1 | 4.5 |
| Valeur, nom, titre de groupe | 11–13:1 | 7.5–9:1 | 3.0 |

Deux pieges de mesure, tombes tous les deux :

- les cartes se peignent avec un `linear-gradient`, donc leur `backgroundColor`
  est **transparente**. Composer les fonds en ne lisant que `backgroundColor`
  saute la couche translucide de la carte et sous-estime le contraste ;
- tout element avec `transition: color` se mesure faux juste apres un
  changement de palette : `getComputedStyle` renvoie la couleur **en cours
  d'animation**. Injecter `* { transition: none !important }` avant de mesurer.

L'onglet inactif a besoin de sa propre variable (`--text-tab`) : sa pastille est
posee sur le halo du fond, dont la luminance mesuree est 0.0435 contre 0.0361
sous une carte. Le meme gris n'y vaut pas le meme contraste.

**Cibles tactiles : 44 px rendus minimum.** Une carte est un `<div>`, jamais un
lien ; le seul element cliquable est `a.service-title-text`, et l'icone est un
**second** lien vers la meme cible. Etat mesure :

| Cible | Touchable |
|---|---|
| Onglets | 44 px |
| Titre de carte | 44–52 px |
| Icone de carte | 45 px |
| Favoris | 57 px |
| Boutons de fond | 45 px |
| En-tetes de groupe | 25–37 px (**decision assumee**, voir ci-dessous) |

Se mesure par balayage `elementFromPoint`, jamais avec
`getBoundingClientRect` : ce dernier ne voit ni les surfaces etendues par
`::after`, ni le rognage par le bord du cadre, ni le **vol** de surface par un
ancetre. C'est ainsi qu'on a trouve que le panneau de repli, elargi par marges
negatives pour laisser passer l'ombre des cartes, recouvrait les titres de
groupe : « Liens » n'offrait plus que 7 px touchables sur 24.5 de boite. Le
correctif de classe est `pointer-events: none` sur le rembourrage-artifice et
`auto` sur ses enfants.

**Les en-tetes de groupe restent sous le seuil, volontairement.** La cible fait
1125 px de large, elle s'acquiert sans viser ; et replier un groupe est une
action *non desiree* sur un mur — l'agrandir rendrait l'accident plus probable,
pour 30 px pris a la marge de hauteur. Une ligne suffit pour changer d'avis, le
raisonnement est dans `custom.css`.

## Le langage d'alarme

Deux causes, un seul rendu. La question posee de loin est « est-ce que quelque
chose va mal ? », pas « quelle sonde l'a vu » :

1. **Statut du service.** Avec `statusStyle: "dot"`, Homepage rend
   `<div class="rounded-full h-3 w-3 bg-emerald-500">` et remplace la teinte par
   `bg-rose-500` (erreur reseau ou statut > 403) ou `bg-orange-400` (degrade).
   Le CSS accroche ces classes.
2. **Seuils sur les valeurs** (voir la table suivante) : `custom.js` pose un
   `data-state` sur le bloc de metrique, le CSS s'y accroche de la meme facon.

Dans les deux cas : le **nombre** change de couleur, et la **carte entiere**
prend un fond teinte, une bordure et un liseré de 5 px. Un liseré seul ne suffit
pas — a `z = 0.87` un liseré de 3 px fait 2.6 px rendus, plus fin qu'un trait de
bordure, invisible a un metre. C'est le fond teinte qui se voit en vision
peripherique.

!!! warning "Le style de statut et l'alarme sont lies"
    Sans `statusStyle: "dot"` dans `settings.yaml`, Homepage rend un **texte**
    colore par `text-rose-500` a la place de la pastille, et les regles CSS
    d'alarme ne matchent plus rien : un service tombe ne produit alors AUCUN
    signal visuel. C'est exactement ce qui arrivait lors de la panne decrite
    plus bas.

## Seuils

Le tableau ne disait que l'etat, jamais ce qui allait mal : la couleur ne venait
que du statut HTTP, donc un service qui repond en 200 avec des chiffres
catastrophiques restait blanc sur fond sombre. `ANCIENNETE H = 20` s'affichait
exactement comme `= 2`.

Table declaree dans `custom.js`. Les libelles sont ceux de l'i18n du conteneur
(`/app/public/locales/fr/common.json`) : les widgets natifs traduisent leurs
libelles, un nom approximatif ne matcherait rien **en silence**.

| Service | Metrique | Avertissement | Critique | Pourquoi |
|---|---|---|---|---|
| Sauvegardes | Anciennete h | 26 | 50 | quotidien : 26 h absorbe un decalage, 50 h veut dire deux fenetres sautees |
| Sauvegardes | Perimes | 1 | 2 | un seul repo perime est deja une anomalie |
| PBS | Datastore | 75 % | 90 % | |
| PBS | Taches echouees 24h | — | 1 | il n'y a pas de « un peu echoue » |
| Machines | En ligne | — | ratio | `"3 / 3"` : des qu'un hote manque, critique |
| sucre | Incidents | 5 | 20 | |
| sucre | Attente | 1 | — | une approbation en attente est une action pour l'utilisateur |
| sucre | Budget | 80 % | 95 % | |
| galahad / lancelot | CPU, RAM | 85 % | 95 % | |
| AdGuard / DNS failover | Latence | 80 ms | 200 ms | au-dela de 80 ms la navigation se sent |

La ligne **Machines / En ligne** est la plus importante du tableau : c'est le
seul endroit qui verrait un noeud Proxmox tomber. C'est l'angle mort qui a laisse
lancelot hors service onze jours en juillet 2026.

Ces seuils sont une calibration, pas une verite : le premier franchissement reel
dira s'ils crient trop tot. Prevoir une passe de reglage.

## Tendance

Une fleche ▲/▼ pendant 10 minutes sur les valeurs qui ont bouge. De loin, on
repere un changement bien mieux qu'on ne lit un chiffre.

Restreinte aux metriques ou un changement veut dire quelque chose (`tendance:
true` dans la table) : sur du CPU ou de la latence, une fleche serait allumee en
permanence, donc muette. L'etat vit dans `localStorage`.

Piege : comparer les valeurs en **texte** ne marche pas. `splitUnits()` reecrit
`"5 %"` en `"5"` + `<span class="unit">%</span>`, donc `textContent` passe de
`"5 %"` a `"5%"` — compte pour un changement, et allume une fleche sur une
metrique immobile. La comparaison est numerique.

## Le piege a connaitre : la page statique

**Symptome.** Apres un demarrage du conteneur, le dashboard perd son titre, sa
langue, **sa barre d'onglets** et son `statusStyle` — donc toute capacite
d'alarme. Panne discrete : les services, les favoris et `custom.css` continuent
de s'afficher, la page a l'air presque normale.

**Cause.** Les reglages de page viennent des props de la page statique Next.js,
pas des routes `/api/services`, `/api/bookmarks` ou `/api/widgets` qui sont lues
a chaque requete. L'image embarque une page prebuilt **sans configuration**, et
Homepage ne la regenere que sur appel de `/api/revalidate`. Ni le serveur ni le
client ne le declenchent apres un demarrage (verifie avec un relais totalement
transparent, 60 s d'attente, zero erreur JS).

Sans correctif, cela se produisait **chaque nuit**, apres le `systemctl restart
docker` de `dietpi-backup` a 01:25.

**Correctif.** L'unite `homepage-revalidate.service`, declenchee par
`docker.service` (`WantedBy` + `PartOf`), appelle
`/api/revalidate` depuis l'interieur du conteneur jusqu'a reponse.

!!! note "Pourquoi pas seulement un hook `post_start:` du compose"
    Il fonctionne pour `docker compose up/restart`, mais **pas** pour
    `docker start` — le chemin emprunte quand le daemon remonte les conteneurs
    via `restart: unless-stopped`, c'est-a-dire precisement le cas nocturne. Le
    hook est conserve pour les operations manuelles, l'unite systemd couvre le
    reste.

Piste ecartee : rendre `/app/.next` inscriptible via un volume nomme supprime
bien les `EROFS` des logs, mais ne change **rien** au symptome.

### Verifier en trente secondes

```bash
# Le titre doit etre celui de settings.yaml, pas "Homepage"
IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' homepage | awk '{print $1}')
curl -s -H "Host: home.gabin-simond.fr" "http://$IP:3000/" | grep -oE "<title[^>]*>[^<]*</title>"

# Reparer a la main si besoin
systemctl start homepage-revalidate.service
```

Trois discriminants surs pour dire si `settings.yaml` est applique : le
`<title>`, la presence de `#version` (alors que `hideVersion: true`) et celle de
`#myTab`. **Ne pas** se fier au theme : `dark` et `slate` sont AUSSI les valeurs
par defaut de Homepage.

Autre piege de diagnostic : `custom.css` et `custom.js` ne sont pas servis a la
racine mais sous **`/api/config/custom.css`**. Un 404 sur `/custom.css` ne veut
rien dire.

## Mesurer soi-meme

Ne jamais diagnostiquer le CSS de ce dashboard avec une maquette locale : la
feuille Tailwind se charge apres `custom.css`, `custom.js` applique une echelle
fractionnaire, et `#myTab` est absent du rendu serveur. Le harnais est un relais
qui reecrit l'en-tete `Host` et injecte une sonde qui **POSTe ses mesures** : on
lit des chiffres, jamais un PNG.

Deux points qui changent tout :

- **geometrie et lisibilite ne se mesurent pas dans le meme mode.** Widgets
  court-circuites : geometrie deterministe, tous les groupes presents, mais des
  encarts d'erreur a la place des metriques — aucune conclusion possible sur les
  libelles. Widgets reels : vrais libelles, mais les groupes arrivent en
  asynchrone et le contenu mesure varie. Il faut les deux passes. C'est ce qui a
  masque trois libelles tronques pendant deux etapes ;
- les capacites de pointage **se forcent**, donc les blocs `@media (pointer: ...)`
  sont testables :

```bash
# tactile (pointer: coarse, hover: none)
--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1
# souris fine
--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2
```

`--window-size` n'est pas le viewport : il faut 87 px de plus que la hauteur
visee (`1194,921` donne `innerHeight=834`). Mesurer `innerHeight` avant de
conclure : une mesure faite a 747 au lieu de 834 met `z` au plancher et fait
croire a un debordement inexistant.

## Historique

- **2026-08-03** — spec de refonte : hierarchie plate, 1409 lignes de CSS a
  coups de `!important`, contenu perime.
- **2026-08-04** — themes, fonds, liquid glass ; deux causes racines CSS
  (ombre carree, cartes qui s'elargissent).
- **2026-08-05** — lisibilite mesuree (contraste AA, cibles tactiles), seuils
  sur les valeurs, tendance, et decouverte de la panne de page statique.
