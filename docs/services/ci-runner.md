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

## Le témoin sur l'état de la CI

Le tableau des [contrôles planifiés](../operations/monitoring.md#contrôles-planifiés-timers-penny)
renvoie ici pour `ci-health-check`, qui tourne toutes les 30 minutes sur penny.
Voici ce qu'il fait et pourquoi il existe.

**Pourquoi.** La CI de `homelab-config` est restée rouge du 25/08 07:38 au 27/08
13:38 — vingt runs d'affilée — et personne ne l'a vu ; elle a été découverte par
hasard en vérifiant un push. Le homelab avait des dead-man-switches pour les
hôtes et des gardes de fraîcheur pour les sauvegardes, mais la chaîne qui
**valide les scripts** avant qu'ils partent en production n'avait aucun témoin.
Or ces scripts sont justement ce qui surveille tout le reste.

**Ce qu'il regarde.** Pour chaque dépôt, le dernier run terminé de **chaque**
workflow sur la branche principale. `homelab-doc` en a deux (« CI » et « Deploy
Docusaurus ») et l'un peut casser pendant que l'autre passe : les évaluer
séparément évite qu'un vert en cache un rouge. Les runs sont triés par date de
création plutôt que de faire confiance à l'ordre de sortie de `gh`.

**Il interroge GitHub, pas Forgejo**, alors que Forgejo est la source de vérité :
aucun jeton Forgejo n'est scellé dans `/run/homelab`, et le miroir GitHub reçoit
chaque push — il voit donc les mêmes commits. À basculer si un jeton Forgejo est
un jour scellé.

:::caution[Une sonde aveugle doit alerter — et dire de quoi elle est aveugle]
Si `gh` échoue, la sonde notifie l'aveuglement au lieu de sortir 0 en silence.
C'est la leçon de la sonde SMART, muette 114 passages parce que son binaire
était introuvable dans le `PATH` de cron.

Cela n'a pas suffi. Le **2026-09-02**, la sonde est restée aveugle de 04:04 à
09:35, onze passages ; elle a notifié une fois, puis son cooldown de six heures
l'a fait taire. Au post-mortem il ne restait que `rc=1` : le message d'erreur de
`gh` partait dans `2>/dev/null`. La cause n'est plus établissable, seulement
corrélée à un `LinkChange: major, rebinding` de `tailscaled` cinq secondes avant
l'appel qui a échoué.

`stderr` est désormais capturé. Comme ce texte finit dans le journal **et** dans
la notification, il passe par un caviardage — une ligne, 200 caractères, tout ce
qui ressemble à un jeton remplacé. Un journal de sonde n'est pas un coffre.
:::

### Tout test doit être appelé par le workflow

Depuis le 2026-09-02, une étape « Aucun test orphelin » refuse tout
`scripts/tests/*.test.sh` qui n'est pas invoqué par `.github/workflows/ci.yml`.
Deux tests avaient vécu ainsi — 45 assertions vertes en local qui ne
protégeaient rien. Ajouter un test sans le câbler casse maintenant la CI, au
seul moment où l'oubli est encore réparable.

Le garde a fait rouge son premier run : un troisième test venait d'arriver sans
étape pour l'appeler. Il attrape après le push ; le même contrôle en pré-commit
l'attraperait avant.
