# Retrait de Kroki — 2026-08-31

**Décision** : `kroki` et `kroki-mermaid` sont retirés de la stack de penny.
**Nature** : un retrait mesuré, pas un arbitrage de goût. Les chiffres qui l'ont
tranché sont ci-dessous, pour que la question ne se rouvre pas à l'aveugle.

## Pourquoi la question s'est posée

Le scan Trivy hebdomadaire a été réparé le 30/08 : il échouait en silence sur
`/tmp` depuis le 16/08 et comptait pour **0 CVE** toute image dont le scan
plantait — dont Kroki, la plus lourdement affectée du lot. Une fois réparé, il
rapportait 25 CRITICAL, dont **7 pour Kroki et son compagnon** (6 + 1), et 207
HIGH sur 778.

Le réflexe aurait été de bumper l'image. Vérification faite : le pin déployé
`sha256:6980bfb2…` **était déjà** ce que publie l'amont (`latest` = `0.32.1`,
12/08). Idem pour `kroki-mermaid`. Il n'y avait rien à bumper — les CVE sont dans
la version la plus récente publiée.

## Ce qui a réellement tranché : l'usage, pas la sécurité

Kroki est derrière Authelia, sans port publié, sans NAT entrant. Le risque réel
était faible. Ce qui a décidé, c'est que **rien ne s'en servait** :

| Mesure | Résultat |
|---|---|
| Blocs `mermaid` dans la doc | 27 — rendus par **Docusaurus lui-même** (`@docusaurus/theme-mermaid` 3.10.2, `markdown.mermaid: true`) |
| Plugin Kroki dans `docusaurus.config` | aucun |
| Blocs `plantuml` / `graphviz` / `d2` | 0 / 0 / 0 — aucun format exclusif à Kroki n'est utilisé |
| Requêtes Traefik sur `kroki.home` (11 j de logs) | 2 : un `/favicon.ico` en 404 et un `/actdiag` en 405 |

Les 5 pages qui « citaient Kroki » le mentionnaient en prose (catalogue,
architecture) ; aucune ne l'appelait.

La règle « le trafic ne mesure pas l'outillage » (Portainer, Grafana, PBS : usage
faible = tout va bien) **ne s'applique pas ici**. Ces outils-là servent quand ça
casse, leur silence est la bonne nouvelle. Kroki est un backend de rendu, et la
doc ne l'appelle pas : son silence ne dit pas « tout va bien », il dit « rien n'en
dépend ».

## Effet mesuré

| | avant | après |
|---|---|---|
| CVE CRITICAL de la stack | 25 | **18** |
| dont `linux-libc-dev` (en-têtes noyau, inapplicables en conteneur) | 5 | **0** |
| CVE HIGH | 778 | ~571 |
| Conteneurs | 24 | 22 |
| Images sur disque | — | **3,85 Go rendus** (60 G → 56 G sur `/mnt/ssd`) |
| RAM réservée | 512 + 256 Mo | 0 |

Les 5 `linux-libc-dev` étaient **tous** dans Kroki : le rapport hebdomadaire perd
d'un coup sa note de bas de page la plus embrouillante.

## Ce qui a été retiré

- les deux blocs de `docker/docker-compose.yml` (service + compagnon, 42 lignes) ;
- la tuile `Kroki` de `homepage/services.yaml` ;
- la mention dans le commentaire de `scripts/homelab_backup.sh` (liste des
  services sans état) ;
- les lignes de catalogue dans `docs/services/`, `docs/architecture/`.

Aucune règle Authelia, aucune réécriture AdGuard, aucune sonde de
`homelab_monitor.sh` ne le référençait — vérifié avant retrait. Le moniteur
constitue sa liste attendue dynamiquement, il n'y avait rien à y ajuster.

**Non touché, à dessein** : l'entrée de journal du 15/08 qui a décidé son
installation. Un journal est un compte rendu daté, on ne le réécrit pas.

## Ce que le retrait a révélé, et qui dépasse Kroki

Après suppression, `https://kroki.home…` répond **404** — et Homelable continue
de l'afficher **`online`**.

Sa sonde `https` compte toute réponse HTTP comme un succès, sans regarder le code.
Les **13** cibles `https` de son inventaire mesurent donc la vivacité de
**Traefik**, treize fois, et non celle des backends. C'est exactement le piège
déjà documenté sous « un 302 Authelia ne prouve rien » : une réponse du reverse
proxy ne dit rien du service derrière.

Un témoin qui reste vert pour un service **supprimé** est pire qu'un témoin
rouge : il ressemble à de la couverture.

Restent en base deux traces à retirer depuis l'interface (données utilisateur, non
mutées à la main) :

- `device_inventory` : une entrée `check_target = https://kroki.home…`, `online` ;
- `nodes` : deux éléments de schéma, `kroki` et `kroki-mermaid`.

## Réversibilité

Vingt lignes de compose et un `docker compose up -d`. Si un jour un diagramme
**plantuml** ou **graphviz** doit entrer dans la doc, Kroki est ce qui le permet —
Mermaid seul, Docusaurus le fait déjà.
