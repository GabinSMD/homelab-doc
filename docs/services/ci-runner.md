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

## Pourquoi 4 Go et pas 2

:::warning[Ne pas redescendre à 2 Go]
Le LXC a été passé de **2 à 4 Go le 2026-08-26**, à chaud
(`pct set 108 -memory 4096`, appliqué sans redémarrage).

Motif : un build Docusaurus fait un pic mémoire mesuré à **91,6 % de 2048 Mo**,
soit ~1875 Mo. Avec un seuil d'alerte Pulse à 85 %, **chaque build produisait une
notification et un appel Patrol** — alors que le conteneur est à 3 % le reste du
temps. Le pic n'était pas un problème, l'alerte l'était : un seuil franchi par le
fonctionnement normal n'informe plus.

Sur 4 Go le même pic tombe à 46 %, donc sous le seuil sans avoir à le relever.
Relever le seuil aurait masqué le symptôme ; agrandir le conteneur supprime la
cause et accélère les builds au passage.

Marge côté hôte : lancelot a 16 Go, dont 13 disponibles au moment du changement,
pour 5 Go alloués aux LXC en marche. Il y a de la place.
:::

:::note[Ce réglage n'est pas versionné]
La mémoire d'un LXC vit dans `/etc/pve/lxc/108.conf` sur lancelot, qui n'est pas
dans `homelab-config`. Une reconstruction du conteneur repartira donc du défaut du
template — c'est cette page qui porte l'information, pas un fichier de
configuration.
:::
