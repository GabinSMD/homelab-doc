# Runner Forgejo Actions — LXC 108

La CI complète tourne à la maison. Ce conteneur exécute les workflows de
[Forgejo](forgejo.md) : validation YAML, scan de secrets, lint Markdown, build
Docusaurus.

| | |
|---|---|
| LXC | 108 `ci-runner`, sur **lancelot** |
| Architecture | **aarch64** |
| Enregistré auprès de | `git.home.gabin-simond.fr` |

:::note[Ce conteneur ne figurait dans aucune page avant le 2026-08-26]
Il tournait en production, exécutait la CI de tous les dépôts, et n'était
mentionné **nulle part** dans cette documentation. C'est le cas le plus net de ce
que l'audit de fraîcheur a mis en évidence : une doc organisée par récit laisse
sans domicile ce qui marche sans faire d'histoires.
:::

## L'arm64 n'était pas un obstacle

Le blocage matériel annoncé au départ était faux : les actions et images
nécessaires ont toutes des variantes arm64. Ce qui bloquait réellement était deux
réglages de configuration, pas l'architecture.

## Les trois réglages non évidents

- **`DEFAULT_ACTIONS_URL=github`** — sans lui, un `uses: actions/checkout@v4` ne
  résout pas : le runner cherche l'action sur l'instance Forgejo locale.
- **Une URL d'instance publique** dans la configuration du runner, pas
  `localhost` — sinon le clone des dépôts **privés** échoue.
- **`has_actions` par dépôt** — ce n'est pas un réglage global. Un dépôt sans ce
  drapeau ne déclenche aucun workflow, silencieusement.

## Prévoir le cache

Un build Docusaurus réinstalle plusieurs centaines de mégaoctets de dépendances à
chaque exécution sans cache. Le workflow met donc en cache
`~/.bun/install/cache`, avec une clé sur l'empreinte de `bun.lock` — c'est
sensible ici, la machine étant un LXC sur un ZimaBoard et non un runner hébergé.
