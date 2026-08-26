# Outline — wiki

La surface de **rédaction** de la documentation. Ce site-ci en est la surface de
**publication** : le pipeline va d'Outline vers Docusaurus, et dans ce sens
seulement.

| | |
|---|---|
| Image | `outlinewiki/outline:latest` |
| URL | `wiki.home.gabin-simond.fr` |
| Auth | OIDC Authelia |
| Base | `postgres:16-alpine` + `redis:7-alpine`, réseau `outline` isolé |
| Stockage fichiers | local, `/mnt/ssd/outline/data` |
| Limite mémoire | 512 Mo |

## Surveiller la mémoire

Le conteneur tournait à **392 Mo pour une limite de 512** avant que la synchro vers
Docusaurus n'existe. C'est peu de marge : si le pipeline s'ajoute dans le même
conteneur, la limite est à revoir avant que l'OOM killer ne s'en charge.

## Le pipeline vers cette documentation

Décidé le 2026-08-25, à brancher après la bascule Docusaurus. Trois propriétés non
négociables :

- **Sens unique.** Outline écrit, Docusaurus publie. Pas de synchro
  bidirectionnelle.
- **Les fichiers générés sont commités** dans `homelab-doc`. Sinon le contenu
  rédigé dans Outline échappe à `secret-scan-maison`, qui est la seule couverture
  secrets côté Forgejo.
- **Un verrou anti-édition manuelle** : en-tête « généré » plus des empreintes dans
  un manifeste, et la CI échoue si un fichier généré a été édité à la main.

Deux pièges déjà identifiés : les pièces jointes Outline vivent derrière
`/api/attachments.redirect?id=…`, une URL **authentifiée** donc cassée sur un site
public — il faut les télécharger et réécrire les liens. Et les encadrés Outline
sont déjà en syntaxe `:::info`, directement compatible.

:::note[AFFiNE a été évalué et écarté]
Stockage interne BlockSuite/Yjs et non Markdown, API GraphQL sans contrat de
stabilité, pile plus lourde (Node + son propre Postgres + Redis), OIDC
auto-hébergé moins mûr. Pour un besoin de tableau blanc : Excalidraw, pas AFFiNE.
:::
