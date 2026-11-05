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
| Supervision | 975 px | 0.851 | 67 px |
| Applications | 853 px | 0.973 | 190 px |

(Mesure du 2026-11-04, apres le rattachement du bandeau Etat au seul onglet
Supervision ; Applications etait auparavant au plancher.)

Un PC en fenetre non plein ecran peut aussi etre contraint : a 1034x857,
Supervision est au plancher (`z = 0.80`). C'est la tablette qui dicte, mais
une fenetre basse de PC n'est pas « jamais contrainte ».

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
| Indicateur de lumiere (haut droite) | 44 px (surface etendue au tactile) |
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

:::warning[Le style de statut et l'alarme sont lies]
Sans `statusStyle: "dot"` dans `settings.yaml`, Homepage rend un **texte**
colore par `text-rose-500` a la place de la pastille, et les regles CSS
d'alarme ne matchent plus rien : un service tombe ne produit alors AUCUN
signal visuel. C'est exactement ce qui arrivait lors de la panne decrite
plus bas.
:::

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
| Sauvegardes | Derniere | 48 h | 72 h | texte relatif (« il y a 7 h ») relu en heures ; au-dela de 24 h Intl ne rend que des jours, d'ou des paliers : une nuit sautee avertit, deux alarment |
| Sauvegardes | Perimes | 1 | 2 | un seul repo perime est deja une anomalie |
| PBS | Datastore | 75 % | 90 % | |
| PBS | Taches echouees 24h | — | 1 | il n'y a pas de « un peu echoue » |
| Machines | En ligne | — | ratio | `"3 / 3"` : des qu'un hote manque, critique |
| Mises a jour | Retards | 1 | 3 | une machine en retard = une action ; trois = le mecanisme automatique ne tient plus |
| penny | Conteneurs | — | ratio | `"18 / 18"` : un conteneur arrete, critique |
| penny | CPU | 90 % | — | penny touche 100 % a chaque scan ou build : pas de critique sur le CPU seul |
| penny | RAM | 85 % | 95 % | |
| galahad / lancelot | CPU, RAM | 85 % | 95 % | |
| Traefik | Erreurs | — | 1 | un routeur en erreur = une route cassee (middleware introuvable, service absent) |
| AdGuard / DNS failover | Latence | 80 ms | 200 ms | au-dela de 80 ms la navigation se sent |

Les cartes **sans sonde HTTP** (Sauvegardes, penny, Mises a jour) n'ont pas de
pastille Homepage : `custom.js` en derive une du pire etat de leurs chiffres,
avec le meme balisage que la pastille native. Les regles d'alarme de carte
s'appliquent donc sans CSS supplementaire, y compris la pastille grise quand
le widget n'a plus de donnees.

La ligne **Machines / En ligne** est la plus importante du tableau : c'est le
seul endroit qui verrait un noeud Proxmox tomber. C'est l'angle mort qui a laisse
lancelot hors service onze jours en juillet 2026.

Ces seuils sont une calibration, pas une verite : le premier franchissement reel
dira s'ils crient trop tot. Prevoir une passe de reglage.

## Contenu de la page

| Onglet | Groupes |
|---|---|
| Supervision | **Etat** (bandeau, 5 cartes : Sauvegardes, PBS, Machines, Securite, Mises a jour), Infrastructure (penny et les deux noeuds Proxmox), Reseau (Traefik, AdGuard, DNS failover) |
| Applications | Services, Outils, Liens |

En-tete commun : horloge et accueil, pastille « donnees a jour » (point vert,
orange puis rouge quand le pipeline gele), metriques de penny, meteo, barre de
recherche avec un bouton Claude. La recherche est masquee **au tactile**
(`pointer: coarse`) et non plus selon la hauteur : une fenetre de PC de 939 px
de haut la perdait.

Quelques choix, et pourquoi :

- **Etat sur Supervision seulement.** Sans `tab`, un groupe s'affiche sur tous
  les onglets : 256 px de plus sur Applications, qui ne tenait plus. L'etat se
  lit sur Supervision, Applications sert a ouvrir des services.
- **Mises a jour en 5e colonne d'Etat**, pas sur une rangee a part : une rangee
  de plus faisait passer l'iPad sous le plancher, une colonne non. Sous 250 px
  de largeur de carte, une requete de conteneur reduit les chiffres du bandeau.
- **Carte penny** : lue sur l'agent Pulse (conteneurs actifs / total, CPU,
  RAM). La temperature reste dans l'en-tete, avec une jauge bornee a 80 °C,
  le seuil ou le Pi 4 bride son processeur (libelle « Bridage »).
- **Meme hauteur par rangee.** La carte remplit la cellule de grille et sa
  rangee de chiffres descend en bas : les valeurs restent alignees. Fait en
  CSS par rangee, pas avec `useEqualHeights`, qui egalise toute la page et
  etirerait les cartes-liens a la hauteur des cartes a metriques. Dans les
  cartes-liens, la description est toujours sous le nom.

## Lumiere horaire, facon f.lux

Plus de bascule clair/sombre ni de selecteur de fond : la photo est toujours
affichee, et le theme suit le soleil.

- **Clair du lever au coucher du soleil, sombre ensuite.** Les heures sont
  calculees dans le navigateur (formule NOAA, precision d'environ une minute)
  pour les coordonnees de la meteo : un seuil fixe a 18 h serait en pleine nuit
  en decembre et en plein jour en juin. Aucun appel reseau.
- **Teinte ambree le soir** : elle monte apres le coucher, est pleine a 22 h et
  se retire au lever. Le calque n'existe que lorsque la teinte est non nulle.
- **L'indicateur en haut a droite** annonce le prochain changement
  (« coucher 17:26 »). Le toucher inverse le theme **jusqu'au changement
  suivant**, jamais en permanence : un oubli se corrige tout seul.

Homepage garde son propre etat de theme (React), mais ne l'applique au DOM
qu'au **changement** d'etat, donc au clic sur sa bascule, que l'on masque.
`custom.js` peut ainsi piloter la classe `dark`/`light` et `theme-mode` dans
`localStorage` sans etre ecrase.

## Regles de rendu apprises le 2026-11-04

**Jamais d'arrondi « pilule » a 999 px.** Sous Firefox, a 100 % de zoom et
dans une page qui defile, un rayon geant ramene a la demi-hauteur laissait des
traits : verticaux a un rayon de chaque bout, horizontal a mi-hauteur, soit
les jointures du decoupage de la forme en coins et bords. Le `rounded-full` de
Tailwind (rayon calcule de 3,4·10⁷ px) a le meme defaut. Chaque pilule a donc
un rayon explicite, juste sous sa demi-hauteur, et les petits elements 12 px.
Ni Chromium ni Firefox en mode headless ne reproduisent le defaut : la cause a
ete tranchee **dans le navigateur de l'utilisateur**, par un panneau de cases a
cocher qui neutralisait un suspect a la fois. Trois correctifs a l'aveugle
(calque de teinte, ombre, isolation) avaient echoue avant.

**Le bandeau Etat s'identifie par son icone**, pas par sa position. Le style
du bandeau visait le premier groupe de la page ; or Homepage ne rend que les
groupes de l'onglet actif, et Services devenait premier sur Applications (puis
de nouveau quand une tuile a metriques y a ete ajoutee). Le selecteur vise
desormais le groupe dont l'icone est `mdi-heart-pulse` : changer cette icone
dans `settings.yaml` impose de changer le CSS.

**`customapi` affiche quatre champs au plus**, en dur (`mappings.slice(0, 4)`
dans le code de Homepage) ; `fields` ne leve pas la limite. Une valeur
« actifs / total » se fabrique en mappant les deux champs puis en repliant le
second dans le premier cote `custom.js`.

**`custom.css` et `custom.js` sont revalides a chaque chargement.** Homepage
les sert avec un ETag mais sans `Cache-Control` : le navigateur pouvait garder
l'ancien CSS avec une configuration plus recente (icones disparues jusqu'a un
Ctrl+Maj+R). Un routeur Traefik dedie a ces deux chemins, derriere la meme
chaine Authelia, ajoute `Cache-Control: no-cache` (reponse 304 sans corps si
rien n'a change).

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

:::note[Pourquoi pas seulement un hook `post_start:` du compose]
Il fonctionne pour `docker compose up/restart`, mais **pas** pour
`docker start` — le chemin emprunte quand le daemon remonte les conteneurs
via `restart: unless-stopped`, c'est-a-dire precisement le cas nocturne. Le
hook est conserve pour les operations manuelles, l'unite systemd couvre le
reste.
:::

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

Taille de fenetre : avec `chrome --headless=new`, la page est mise en page a
`innerHeight` = fenetre − 87 px **mais capturee a la taille de la fenetre** :
la capture ne montre pas la mise en page mesuree, piege pour tout ce qui
depend de la hauteur (en-tete compact sous 1000 px). Utiliser le binaire
`headless_shell` de Playwright, ou fenetre, viewport et image coincident.
Mesurer `innerHeight` avant de conclure dans tous les cas.

Pour tester une modification des YAML (le relais ne sert que le CSS et le
JS), lancer un conteneur Homepage jetable sur la configuration de la branche
et pointer le relais dessus. Sans `#supervision` dans l'URL, seuls les groupes
sans onglet s'affichent.

Limite connue : les defauts de **composition GPU** (coutures, traits) ne se
reproduisent pas en rendu logiciel, ni Chromium ni Firefox headless. Pour
ceux-la, instrumenter le navigateur de l'utilisateur plutot que d'enchainer
les hypotheses.

## Historique

- **2026-08-03** — spec de refonte : hierarchie plate, 1409 lignes de CSS a
  coups de `!important`, contenu perime.
- **2026-08-04** — themes, fonds, liquid glass ; deux causes racines CSS
  (ombre carree, cartes qui s'elargissent).
- **2026-08-05** — lisibilite mesuree (contraste AA, cibles tactiles), seuils
  sur les valeurs, tendance, et decouverte de la panne de page statique.
- **2026-11-04** — lumiere horaire facon f.lux a la place de la bascule
  clair/sombre et du selecteur de fond ; carte penny ; Traefik avec ses
  routeurs en erreur ; pastilles derivees des seuils ; meme hauteur par
  rangee ; Etat sur Supervision seulement, avec Mises a jour en 5e colonne ;
  traits Firefox (rayons geants) ; revalidation de `custom.css`/`custom.js`.
