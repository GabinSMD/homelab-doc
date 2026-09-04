# Rendre le parc déclaratif — 2026-09-04

**Nature** : chantier de trois jours, parti d'une comparaison avec un homelab
public et fini sur trois mécanismes qui n'existaient pas. Au passage, une fuite
de données ouverte depuis huit jours, et quatorze erreurs de fait dans le plan
qui pilotait le chantier — c'est cette dernière partie qui a le plus appris.

## Ce qui a déclenché le chantier

Une comparaison avec [le dépôt public de Christian
Lempa](https://github.com/ChristianLempa/homelab), qui sert de support à sa
chaîne YouTube. La lecture a été instructive dans les deux sens.

Son dépôt a ce que le nôtre n'avait pas : de l'infrastructure déclarative
(Terraform, Packer) et de la gestion de configuration (Ansible). Le nôtre a ce
que le sien n'a pas du tout — on peut le vérifier par un `grep` sur son arbre
entier, qui ne rend **aucune** occurrence de `restic`, `borg`, `sops`,
`backup`, `alert`, `loki`, `crowdsec` ou `authelia`. Il documente comment
mettre un service debout ; on documente comment le garder debout et le
récupérer. La seconde moitié est absente de chez lui.

À noter avant de s'en inspirer : son dernier commit de *contenu* date du
4 novembre 2024. Les commits de 2026 ne touchent que son financement. C'est
une référence de structure, pas de versions.

Trois écarts ont été retenus. Un quatrième a été écarté à la reconnaissance :
Packer construit des templates de **VM**, et le cluster n'en héberge aucune —
`qm list` est vide sur les deux nœuds. Il a quand même été écrit, pour que la
première VM ne soit pas montée à la main, mais il n'a aucun consommateur et son
build n'a jamais tourné.

## La fuite trouvée en chemin

En construisant le manifeste Ansible, les empreintes de
`/root/lynis-weekly.sh` divergeaient entre les deux nœuds Proxmox.

`galahad` exécutait encore la version d'avant le 25/08 : `NTFY_SERVER` pointait
`https://ntfy.sh`, topic `gabin-homelab` — le ntfy **public**. Cron actif,
`0 5 * * 0`. Chaque dimanche à 05:00, l'indice de durcissement et le nom d'hôte
d'un hyperviseur partaient sur un topic lisible par quiconque le connaît.

Le correctif du 25/08 avait couvert `lancelot`. Pas `galahad`. Et la cause de
l'oubli est écrite noir sur blanc dans les notes de l'époque : elles
affirmaient que « galahad n'en a aucun » — pas de cron lynis. C'était faux, il
avait exactement le même. Le constat erroné n'a jamais été revérifié parce
qu'il était écrit.

Corrigé le 03/09 et vérifié de bout en bout : `audit_rc=0` prouve que l'audit
tourne réellement — l'ancienne version avait aussi un bug de `PATH` qui
l'empêchait de tourner du tout — et `report_age_s=0` prouve la fraîcheur du
rapport. Plus aucun appel réseau : le résultat part dans le journal, qu'Alloy
expédie vers Loki.

Un détail qui a coûté 24 heures : la commande de correction a d'abord été
refusée, et le refus a été attribué au classificateur de sécurité du harnais.
En réalité `ssh galahad` était autorisé depuis toujours ; c'est `ssh
root@<IP>` qui ne correspondait à aucune règle. **Un blocage se teste avant
d'être déclaré.**

## Les trois mécanismes livrés

Le détail opérationnel — quelle commande, ce qu'elle couvre, ce qu'elle ne
couvre pas — est sur sa propre page : [Dérive de
configuration](../../operations/derive-configuration.md). En résumé.

**Un manifeste Ansible explicite** : 34 scripts et 47 units systemd sur la Pi,
5 scripts sur les nœuds. `--check --diff` répond enfin à « le dépôt et les
copies live sont-ils d'accord ? ». C'est la question qui n'avait pas de réponse
quand la sonde SMART est morte 114 runs, et quand `galahad` a publié huit jours
de plus que `lancelot`.

**Dix conteneurs LXC déclarés en OpenTofu**, un fichier par conteneur. `tofu
plan` rend `No changes.` — et le jour où il ne le rendra plus, quelqu'un aura
modifié un conteneur à la main. Le token est en `PVEAuditor` lecture seule, et
c'est un garde-fou matériel et non une discipline : une écriture sur l'API rend
**HTTP 403**.

**Un nommage symétrique** là où plusieurs instances coexistent :
`logs/logs-prod-1/` et `logs/logs-replica-1/`, `adguard/adguard-prod-1/`. Coût
réel : 77 secondes de coupure DNS, mesurées, pour le renommage d'AdGuard qui
est le résolveur de tous les LXC.

## Quatorze erreurs de fait dans le plan

C'est la partie qui mérite d'être écrite. Le plan qui pilotait ce chantier
comptait 1500 lignes et douze tâches. **Quatorze de ses affirmations étaient
fausses, et les quatorze ont été trouvées à l'exécution**, pas à la relecture.

Les plus instructives :

**Deux fois le même angle mort.** Le recensement des scripts non versionnés et
le manifeste des nœuds ont tous deux été construits en appariant des noms de
base contre `scripts/` uniquement. Chaque fois qu'une variante existait dans
`system/scripts/`, le mauvais fichier était retenu. Conséquence concrète : le
manifeste allait déployer sur les nœuds la variante Docker d'`egress-audit.sh`,
alors que la chaîne `DOCKER-USER` n'existe pas sur un hyperviseur — le script
aurait cassé au lancement suivant. Et il allait écraser le hook `vzdump` v4
anti-race par une copie périmée de 78 lignes.

**Un critère d'acceptation rouge avant tout changement.** Une tâche devait se
valider par `curl /ready` sur `loki-replica`. Cette sonde rend 503 en
permanence sur ce conteneur, qui sert pourtant normalement.

**Une sauvegarde supposée.** Le plan affirmait que l'état Terraform vivait
« dans le périmètre restic du dépôt principal ». Faux :
`homelab_backup.sh` sauvegarde une liste explicite de sous-répertoires, et
`iac/` n'y était pas. L'état — gitignoré, donc sans protection git non plus —
a vécu une journée sans aucune copie. Le plan disait pourtant « à vérifier
explicitement, pas à supposer ». La bonne instruction était accompagnée d'une
supposition fausse.

**Un secret qui devait passer par un affichage.** Le plan faisait afficher le
token API puis le recopier à la main. Un secret qui traverse un terminal
atterrit dans un historique et un scrollback, et celui d'un token API ne
s'affiche qu'une fois. Refait : le secret est canalisé du générateur vers le
fichier scellé, contrôlé sur sa longueur et jamais sur son contenu.

**Un outil dont le nom promet plus qu'il ne fait.** Le plan disait de sceller
le token par `homelab-seal-secrets.sh`. Ce script ne traitait que
`authelia/secrets/` et deux fichiers CrowdSec — **pas le `.env` principal**,
alors que son nom le laisse croire. Quiconque éditait le `.env` et lançait ce
script en pensant l'avoir scellé perdait sa modification au redémarrage
suivant, le clair vivant en tmpfs. Il le fait désormais, avec un contrôle de
déchiffrement **avant** de remplacer le fichier scellé : un `.env.enc`
illisible serait pire que pas de `.env.enc`, parce qu'il aurait l'air d'une
sauvegarde.

### Ce que ça dit sur la manière d'écrire un plan

Le plan a été écrit en une passe, à partir de mesures prises sur les machines
mais jamais recroisées. Toutes les erreurs sont de ce type : une transcription
approximative, une variante non cherchée, une supposition glissée à côté d'une
instruction correcte.

Aucune n'a atteint la production, et c'est le seul point rassurant : la boucle
de relecture les a toutes arrêtées, et trois fois un exécutant a **refusé
d'appliquer** en constatant que ce qu'il allait écraser valait mieux que ce
qu'il allait écrire. Le refus a plus servi que l'obéissance.

Mais la relecture a payé une dette qui n'aurait pas dû exister. La règle qui en
sort : **un plan qui produit un inventaire doit le vérifier ligne à ligne avant
de l'écrire, pas après.**

## La règle qui vaut au-delà de ce chantier

Un renommage, dans ce parc, ne casse pas les garde-fous : **il les rend
muets.** Quatre occurrences en trois jours, toutes manifestées par un vert.

- `repo-drift-check.sh` cherchait ses fichiers dans un répertoire devenu
  parent. `find` ne trouvait rien, `2>/dev/null` avalait l'erreur, le contrôle
  rendait « OK » sans plus rien comparer.
- `ci.yml` et `pre-merge-check.sh` validaient les fichiers compose derrière un
  `if [ -f ]` **sans branche d'échec**. Un chemin mort y était sauté en
  silence.
- Un motif `.gitignore` ne matchait plus, laissant les fichiers temporaires
  d'AdGuard prêts à remonter dans un commit.

Le remède qui a tenu est celui posé dans `repo-drift-check.sh` : une garde qui
vérifie que ce qu'elle surveille **existe encore**, et remonte une dérive
sinon. Les autres ont reçu la même chose — sortir en erreur plutôt que passer.

Quand on écrit un contrôle, la question n'est pas « détecte-t-il le
problème ? » mais **« que rend-il si sa cible disparaît ? »**. S'il rend vert,
ce n'est pas un contrôle. C'est le même motif que le [témoin
orphelin](../../operations/incidents-recurrents.md) et que la sonde SMART, sous
une troisième forme.

## Ce qui reste ouvert

Sept scripts tournent sur penny sans exister dans git — une réinstallation les
perdrait. La liste est dans `homelab-config/ansible/NON-VERSIONNES.md`, leur
tri demande un arbitrage.

`setup-node-exporter.sh` porte au dépôt un correctif nfsd/systemd du 27/08 que
les nœuds n'ont pas. Le déployer est une décision, pas une réparation.

Deux doublons de nom subsistent : `scripts/vzdump-permfix-hook.sh` est une
copie périmée de la vraie source dans `system/scripts/`, et `fix-emmc.sh` est
`proxmox-fix-emmc.sh` sous un autre nom. Rien ne relie les paires — c'est
exactement le terrain du témoin orphelin.

Et la symétrie d'AdGuard reste nominale : la configuration du secondaire, qui
tourne en natif sur le LXC dns-failover, n'est pas au dépôt.
