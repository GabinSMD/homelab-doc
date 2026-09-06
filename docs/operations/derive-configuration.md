# Dérive de configuration

Deux questions se posent en permanence dans ce homelab, et jusqu'au 2026-09-03
aucune des deux n'avait de réponse mécanique :

1. **Ce que le dépôt déclare est-il ce qui tourne ?** Les scripts versionnés
   dans `homelab-config` sont recopiés vers `/usr/local/bin/` et `/root/` sur
   les trois hôtes. Rien ne garantissait que les copies suivaient.
2. **Les conteneurs du cluster sont-ils tels qu'on les croit ?** Les dix LXC étaient
   montés à la main, sans description nulle part.

Elles ont désormais chacune une commande. Cette page dit laquelle, ce qu'elle
couvre, et surtout ce qu'elle ne couvre pas.

## Pourquoi ça compte : trois pannes muettes

Ce ne sont pas des hypothèses, ce sont les incidents qui ont motivé le
chantier.

**La sonde SMART morte 114 runs.** Un script corrigé dans le dépôt, jamais
redéployé vers sa copie live. Le contrôle rendait vert parce qu'il ne tournait
pas — voir [PATH cron](./incidents-recurrents.md).

**Huit jours de fuite après un correctif annoncé.** Le `lynis-weekly.sh` de
`lancelot` a été corrigé le 25/08 pour couper une publication vers le ntfy
**public**. `galahad` avait le même cron et n'a pas été touché : il a continué
à publier son indice de durcissement et son nom d'hôte sur un topic public
jusqu'au 03/09. Le correctif était appliqué à un hôte, pas au parc. Récit
complet : [journal du 2026-09-04](../projet/journal/2026-09-04-declaratif-ansible-terraform.md).

**Quatre garde-fous endormis par un renommage.** En renommant `logs/` en
`logs/logs-prod-1/` et `adguard/` en `adguard/adguard-prod-1/`, quatre
contrôles ont cessé de contrôler *sans cesser de rendre vert* :

- `repo-drift-check.sh` cherchait ses fichiers dans un répertoire devenu
  parent — son `find` ne trouvait rien, son `2>/dev/null` avalait l'erreur ;
- `ci.yml` et `pre-merge-check.sh` testaient un chemin mort par un
  `if [ -f ]` **sans branche d'échec**, sautant la validation en silence ;
- un motif `.gitignore` ne matchait plus, laissant les fichiers temporaires
  d'AdGuard prêts à remonter dans un commit — le plus instructif des quatre,
  puisque ce n'était même pas un « contrôle ».

Le motif est le même dans les trois cas : **la panne se manifeste par un
succès.** C'est ce que ces deux commandes rendent visible.

## Répondre à la question 1 : les scripts et les units

```bash
cd /mnt/ssd/config/ansible
ansible-playbook playbooks/deploy-scripts.yml --check --diff
ansible-playbook playbooks/deploy-systemd.yml --limit penny --check --diff
```

`--check` n'écrit rien. `changed=0` signifie que chaque fichier déclaré est
identique à sa copie live. Un `changed` affiche le `diff` : **lis-le avant
d'appliquer.** Trois fois pendant ce chantier, la copie live était la bonne et
le dépôt était en retard — appliquer aurait détruit un correctif de
production.

Pour appliquer, la même commande sans `--check`. L'idempotence se prouve en
relançant le `--check` juste après : il doit rendre `changed=0`.

### Ce que ça couvre

| Manifeste | Portée |
|---|---|
| `ansible/inventory/group_vars/penny.yml` | 34 scripts + 47 units systemd sur la Pi |
| `ansible/inventory/group_vars/pve_nodes.yml` | 5 scripts sur `galahad` et `lancelot` |

Le manifeste est **explicite**, jamais un glob : `scripts/` contient aussi des
tests, des migrations à usage unique et des scripts destinés aux LXC, qui n'ont
rien à faire sur un hôte.

### Ce que ça ne couvre pas

**Sept scripts tournent sur penny sans exister dans git** — une réinstallation
les perdrait. La liste vit dans `homelab-config/ansible/NON-VERSIONNES.md`. Ils
sont hors manifeste par construction : on ne peut pas déclarer la source d'un
fichier qui n'en a pas.

**`setup-node-exporter.sh` est volontairement hors manifeste.** Le dépôt y est
en avance d'un correctif nfsd/systemd du 27/08 que les nœuds n'ont pas. L'y
ajouter ferait de son premier `apply` un **déploiement**, pas une réparation de
dérive. Déployer un correctif est une décision ; l'ajouter au manifeste suffira
le jour où elle est prise.

**Le template Packer n'est couvert par rien**, et c'est normal : il n'a aucun
consommateur. Le cluster n'héberge aucune VM — `qm list` est vide sur les deux
nœuds — et son build n'a jamais tourné. Il existe pour que la première VM ne
soit pas montée à la main. Vérifier l'espace sur `galahad:local` avant tout
build : il était à 78 % le 2026-09-03.

**`sync-grafana-config.sh` n'y est pas non plus**, et c'est volontaire : il
n'a aucune copie live, il s'invoque depuis le dépôt. Le manifeste déclare les
fichiers dont une copie existe et doit rester en phase ; y ajouter celui-là
créerait une surface de dérive là où il n'y en a pas.

## Répondre à la question 2 : les dix LXC

```bash
cd /mnt/ssd/config/iac/terraform
export $(grep -E '^PROXMOX_VE_' /run/homelab/.env | xargs)
tofu plan
```

:::warning[N'exportez que les trois variables du provider]
Un `set -a; . /run/homelab/.env; set +a` — la forme qui figurait ici jusqu'au
2026-09-04 — met les **37 secrets** du homelab dans l'environnement du shell,
de tous ses enfants et de `/proc/<pid>/environ` : token Cloudflare, clef
Tailscale, secrets Outline, Forgejo, Firefly. Pour un `plan` qui en a besoin de
trois.

C'est le même raisonnement que « un secret qui passe par un terminal atterrit
dans un historique, une transcription et un scrollback », appliqué une ligne
plus loin — et il avait été manqué là.
:::

Attendu : `No changes. Your infrastructure matches the configuration.`

Un plan non vide signifie que quelqu'un a modifié un conteneur à la main. Un
fichier par conteneur, nommé `<VMID>-lxc-<nom>.tf`.

:::danger[Un plan vide ne prouve pas que le cluster est tel qu'on le croit]
Il prouve que les conteneurs **déclarés** correspondent à leur déclaration.
Terraform ne compare que ce qu'il connaît — un conteneur créé à la main lui est
**invisible**.

Mesuré le 2026-09-04 : le LXC 110 « securo » tournait sur lancelot, aucune
déclaration ne le mentionnait, et `tofu plan` répondait « No changes ». La page
que vous lisez affirmait le contraire ; c'était faux.

La moitié manquante vient de `control-drift-check.sh`, qui compare la liste des
invités de chaque nœud aux fichiers de déclaration présents et signale les
absents — sans token ni tofu. **Il faut les deux** : `tofu plan` pour la
fidélité, `control-drift-check.sh` pour l'exhaustivité.
:::

### Le garde-fou est matériel, pas déclaratif

Le token API `terraform@pve!iac` a le rôle **`PVEAuditor`**, en lecture seule.
Vérifié : une tentative d'écriture sur l'API rend **HTTP 403**. Un `tofu apply`
lancé par erreur échoue donc côté Proxmox, indépendamment de toute discipline
côté client. `prevent_destroy` est posé sur les dix ressources en second filet.

### La limite à connaître avant tout `apply`

**Quatre conteneurs portent des clés LXC que le provider ne modélise pas** :

```
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```

C'est le passthrough TUN dont Tailscale a besoin en LXC non privilégié. Il
concerne les CT **100** (dns-failover), **104** (zomboid), **105** (sucre) et
**107** (waterline).

Terraform ne les voit pas, donc il ne les détruira pas. Mais une **recréation**
les perdrait en silence, et Tailscale tomberait sur ces quatre conteneurs sans
que rien ne le signale. C'est la raison d'être du `prevent_destroy`, et la
raison pour laquelle passer le token en écriture est une décision à prendre les
yeux ouverts.

### L'état, et pourquoi il est sauvegardé à part

`terraform.tfstate` contient le token en clair : il est gitignoré, donc **sans
aucune protection git**. Il a vécu une journée sans sauvegarde du tout, parce
qu'on avait supposé que « c'est sous `/mnt/ssd/config`, donc restic le prend ».
Faux : `homelab_backup.sh` sauvegarde une **liste explicite** de
sous-répertoires, et `iac/` n'y figurait pas. Il y est depuis.

La leçon dépasse ce fichier : *être sous le répertoire sauvegardé ne prouve
rien quand la sauvegarde procède par liste.*

En dernier recours, l'état se reconstruit par ré-import — plus lent, mais rien
n'est perdu. Voir `homelab-config/iac/README.md`.

## La troisième question : reconstruire, et pas seulement maintenir

Les deux commandes ci-dessus **maintiennent en phase un système déjà installé**.
Elles ne savent pas partir d'une machine nue. Depuis le 2026-09-06, trois
playbooks de plus s'en chargent — et un quatrième juge le résultat.

| Playbook | Ce qu'il pose | Éprouvé ? |
|---|---|---|
| `bootstrap-base.yml` | paquets, Docker, sops, Tailscale *installé mais pas enrôlé*, Alloy | **oui**, sur banc jetable |
| `bootstrap-stack.yml` | socket-proxy, traefik, authelia, adguard, homepage | **oui**, sur banc jetable |
| `bootstrap-pi.yml` | `/boot/firmware`, `/etc/modules`, fstab, zram DietPi, paquets matériel Pi | **non** — jamais exécuté pour de vrai |
| `verify.yml` | rien : il **juge** | oui, sur les deux cibles |

```bash
cd /mnt/ssd/config/ansible
ansible-playbook playbooks/verify.yml -e cible=penny
```

Exécuté le 2026-09-06 : `ok=11 failed=0` sur penny (37 clefs descellées) et sur
le banc LXC 111 (14 clefs). **Sur le banc**, le cycle complet
détruire-recréer-reconstruire-juger tient en **490 s** sans intervention (reset
58 s, couche 1 316 s, couche 2 105 s, verdict 11 s). Sur penny, seul `verify.yml`
a réellement tourné — voir les réserves plus bas.

### Ce que `verify.yml` fait, et que les healthchecks ne font pas

Il ne demande pas « le conteneur est-il *healthy* ? » mais « le service
**sert**-il ? ». Deux mesures de ce homelab imposent la distinction : un 302
d'Authelia vient du middleware et non du backend (CyberChef est resté mort 24 h
derrière un 302), et `loki-replica` rend 503 sur `/ready` en servant
normalement.

Il porte surtout un **contrôle négatif** : un hôte en `.invalid` — non
délégable par construction, donc qui ne pourra jamais correspondre à un routeur
réel — doit obtenir une réponse *différente* du vrai domaine. Sans cette
contre-épreuve, la sonde ne distinguerait pas un routage d'une redirection
inconditionnelle. Mesuré sur penny : vrai domaine `302`, hôte inexistant `000`.

### Le banc jetable, et ce qu'il ne peut pas prouver

Le banc est un LXC amd64 sur `galahad`, monté et détruit par
`scripts/banc-test.sh` (`create|destroy|reset|status`). Il porte
`192.168.1.28/32` sur sa loopback — l'adresse de penny — pour que Traefik s'y
lie comme en production, avec `arp_ignore=1` posé **avant** l'adresse pour
qu'il ne réponde jamais à l'ARP du LAN à la place de penny.

Le critère d'acceptation le plus important du chantier n'était pas que
`verify.yml` passe : c'est qu'il **échoue sur un banc nu**. Un juge qui rend
vert sur une machine vide ne juge rien.

Ce qu'un LXC amd64 ne peut pas porter : `/boot/firmware`, une carte SD,
`vcgencmd`, DietPi. La couche 3 est donc **appuyée** sur penny — penny comme
oracle, `--check --diff`, gardes de pré-vol éprouvées par cinq fautes
provoquées — mais appuyer n'est pas éprouver. Ces appuis **prouvent la
non-régression, pas la reconstruction.**

### Trois réserves à connaître avant de s'en servir

**La couche 1 ne tourne pas sur penny.** `paquets_base` n'est déclaré que pour
le groupe `banc` ; visée sur penny, la couche s'arrête sur
`'paquets_base' is undefined` (mesuré le 2026-09-06). Ce n'est pas un oubli à
combler d'un copier-coller : la liste du banc **exclut délibérément** les
paquets matériel Pi, que la couche 3 reprend à son compte. Décider ce que penny
reçoit est une décision, pas une variable.

**Les trois couches refusent de tourner sans `bootstrap_autorise`.** Déclaré
par groupe dans `inventory/homelab.yml` : vrai pour le banc, faux pour penny et
pour les nœuds Proxmox. Le cran est délibéré — la couche 1 installerait des
dizaines de paquets et trois dépôts apt tiers sur la production. Une cible sans
déclaration **échoue** au lieu de passer : le garde juge la chose protectrice,
jamais la chose dangereuse.

**Rien ne rejoue le banc automatiquement.** La CI (`.github/workflows/ci.yml`)
exerce la *logique pure* du pré-vol et de `banc-test.sh`, pas le cycle réel :
celui-ci demande `galahad`, six gigaoctets et huit minutes. Dire « éprouvé à
chaque campagne » serait une intention ; ce qui est vrai, c'est « éprouvé le
2026-09-06 ».

Le parcours complet de reprise — matériel, coffre, YubiKey, ordre de démarrage
— reste dans [la procédure break-glass](./break-glass.mdx).

## Un garde-fou doit hurler, pas hausser les épaules

C'est la seule règle que ce chantier a produite, et elle a coûté quatre
occurrences pour être admise.

`repo-drift-check.sh` porte désormais une garde qui vérifie que les répertoires
et fichiers qu'il surveille **existent encore**, et remonte une dérive sinon.
Sans elle, un renommage le rendait muet : son `find` ne trouvait rien, son
`2>/dev/null` avalait l'erreur, et il rendait « OK » sans plus rien comparer.

Même correction dans `ci.yml` et `pre-merge-check.sh` : la boucle qui validait
les fichiers compose testait leur présence par `if [ -f ]` **sans branche
d'échec**. Un chemin mort y était silencieusement sauté. Elle sort désormais en
erreur.

Quand vous écrivez un contrôle, la question n'est pas « détecte-t-il le
problème ? » mais **« que rend-il si sa cible disparaît ? »**. S'il rend vert,
ce n'est pas un contrôle.

## Un piège adjacent : ne pas sonder `/ready` sur loki-replica

Mesuré le 2026-09-03 : `loki-replica` rend **HTTP 503** sur `/ready`
(« Ingester not ready ») alors qu'il tourne depuis des heures et sert
activement des requêtes. `/metrics` et `/loki/api/v1/labels` rendent 200, et
les Alloy poussent sans problème.

Ce conteneur n'a **aucun healthcheck déclaré**, et `autoheal` tourne dans la
stack. Ajouter un healthcheck basé sur `/ready` — le choix évident — le
marquerait *unhealthy* en permanence et autoheal le redémarrerait en boucle. Si
un healthcheck devient souhaitable, le baser sur `/loki/api/v1/labels`.
