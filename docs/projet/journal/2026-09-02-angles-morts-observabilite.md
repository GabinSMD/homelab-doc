# Angles morts d'observabilité — 2026-09-02

**Nature** : passage en revue du homelab et de sa documentation, puis
traitement de ce qui pouvait l'être sans intervention physique. Cinq écarts
trouvés, quatre corrigés, un cinquième invalidé par la mesure — il est
consigné ici parce qu'un faux diagnostic mérite autant d'être écrit qu'un
vrai.

L'état de fond était bon : aucune unit en échec, 22 conteneurs sains, cluster
quorate à 3 votes, les cinq dépôts restic frais, les 13 garde-fous dans les
délais, et aucune page de doc plus vieille que le 26/08. Tout ce qui suit s'est
vu en creusant, pas en regardant les tableaux de bord.

## 1. Loki ne voyait que 5 sources sur 13

Le constat qui compte : **la seule LXC observée était la seule à l'arrêt.** En
plus des trois hôtes et de `finance`, la seule à expédier des logs était
`sucre`, dont le service est arrêté depuis le 25/08. Vaultwarden, PBS, le
runner de CI, le résolveur DNS de secours, la pile Loki/Grafana elle-même,
Pulse, zomboid et waterline n'avaient aucune trace centralisée — donc aucune
alerte possible sur ce qui s'y passe.

Ce n'était pas un oubli mais un compromis écrit : la page Alloy actait « LXC
100/102/103 : pas d'Alloy, trade-off accepté ». Il a été renversé, et le
raisonnement est [sur la page elle-même](../../services/alloy-loki-ha.md#hosts-avec-alloy).
En deux mots : un backup restic protège les données de Vaultwarden, pas la
lecture d'une série d'échecs d'authentification ; et « PBS ne log pas grand
chose » a été démenti le 06/07 par un `rpc.nfsd` qui a rendu ENOMEM en silence.

Le coût réel s'est révélé être le volume, pas le principe. Une fois Alloy posé,
un seul conteneur — `pulse` — produisait **61 lignes par minute**, environ
88 000 par jour, plus que les trois hôtes réunis : « Starting background
polling », « No alerts needed cleanup », « PBS backups fetched ». La réponse est
le filtrage par niveau, pas le renoncement à la source : `info` jeté, `warn` et
au-delà conservés. Restait alors un unique motif, douze fois par minute, un
avertissement d'état sur la lecture des températures par SSH — écarté aussi.
De 61 à environ 5 lignes par minute.

Deux autres exclusions délibérées : les conteneurs de job du runner de CI (un
par push, déjà lisibles dans Forgejo) et le conteneur `loki` lui-même, qui
journalise ses push refusés et s'auto-alimenterait.

**Le coût en disque, mesuré et non supposé.** Le rootfs du LXC 101 est passé de
67 à 72 % pendant l'opération, ce qui ressemble à une pente inquiétante sur un
volume qui n'a que 2,7 G de libre. Vérification à quatre minutes d'intervalle,
une fois tout en place : le répertoire Loki est passé de 393 à **391 Mo** et
l'espace libre a *gagné* 2 Mo. Les 5 points étaient le rattrapage initial — 12 h
de journald pour dix invités, plus l'historique des `json.log` de conteneurs —
et non un régime permanent. Le débit ajouté est d'environ 11 % de lignes en
plus, une fois `pulse` filtré.

C'est la mesure qui tranche, pas la silhouette de la courbe : un saut unique et
une pente ont la même tête si on ne regarde qu'une fois.

## 2. Une sonde aveugle qui ne disait pas de quoi

`ci-health-check` est restée **AVEUGLE de 04:04 à 09:35**, onze passages
d'affilée. Elle a notifié une fois, puis son cooldown de six heures l'a fait
taire — ce qui est le comportement voulu.

Le problème est ailleurs : au post-mortem il ne restait que `rc=1`. Le message
d'erreur de `gh` partait dans `2>/dev/null`. La cause n'est donc plus
établissable, seulement corrélée — `tailscaled` a journalisé un `LinkChange:
major, rebinding` avec réinitialisation de sa configuration DNS **cinq secondes
avant** l'appel qui a échoué, et le rétablissement suit le rebind suivant. La
piste est solide, la preuve n'existe pas.

La sonde capture maintenant `stderr`. Comme ce texte finit dans le journal *et*
dans la notification, il passe par une fonction de caviardage : une seule
ligne, 200 caractères, et tout ce qui ressemble à un jeton remplacé. Un journal
de sonde n'est pas un coffre. La fonction est pure, donc le runner de tests
existant l'extrait du fichier de production — sept cas ajoutés, 25 assertions.

:::tip[La leçon générale]
« Une sonde aveugle doit alerter » ne suffit pas. Elle doit aussi dire **de
quoi** elle est aveugle, sinon l'alerte arrive et l'enquête est déjà perdue.
:::

## 3. Deux tests existaient sans jamais tourner

`ssd-recovery-docker.test.sh` (27 assertions) et `trivy-scan-decision.test.sh`
(18) vivaient dans `scripts/tests/` sans qu'aucune étape de CI les appelle. Ils
passent tous les deux : 45 assertions dormantes couvrant la reprise après
décrochage SSD et la décision de notification Trivy.

Un test qu'aucune étape n'appelle est un garde-fou qui ment : il existe, il est
vert en local, il ne protège rien. C'est le motif du [témoin
orphelin](../../operations/monitoring.md). Une étape « Aucun test orphelin »
refuse désormais tout `scripts/tests/*.test.sh` absent du workflow.

Elle a fait rouge son **premier run**, et elle avait raison : un troisième test
venait d'arriver sans être câblé. Le garde fonctionne, mais il attrape après le
push plutôt qu'avant — un hook de pré-commit serait le bon endroit pour le même
contrôle.

## 4. Le journal de rejet ne parlait plus que de lui-même

Sur sept jours, **1000 des 1004 lignes `[EGRESS-DROP]`** sont un seul paquet :
le multicast SSDP que `tailscaled` envoie toutes les dix minutes pour chercher
un UPnP. 99,6 % de bruit dans le seul canal où un vrai rejet se verrait — et il
y en avait quatre, noyés dedans.

Le paquet était déjà refusé par le DROP final ; il est maintenant jeté **avant**
la règle de LOG. La décision ne change pas, seule la ligne disparaît. Vérifié à
chaud : la règle compte les paquets et `tailscale debug portmap` renvoie
toujours `UPnP:true`, la box répondant en unicast sur le LAN.

## 5. Le lien /vmlinuz posé à la main avait pourri {#vmlinuz-symlink}

L'item cosmétique KRNL-5788 était noté « done partiellement : penny — à
propager galahad+lancelot ». Vérification faite, il n'était pas tenu sur penny
non plus : le lien désignait `/boot/vmlinuz-6.12.75` alors que la machine
tourne sur 6.12.96.

Un `ln -s` manuel ne pouvait pas tenir — `do_symlinks=0` sur penny et les
noyaux Proxmox ne posent pas ces liens. Un hook `/etc/kernel/postinst.d/` les
repose à chaque installation de noyau, sur les trois hôtes. Il ne rend jamais
un code non nul : un hook en échec y ferait échouer l'installation du noyau,
prix absurde pour un lien cosmétique.

## Le faux diagnostic : le plancher lynis

Les journaux de `lynis-notify` montrent « score bas 76/100 (plancher 85) » sur
galahad en août, puis un basculement en `stable — silence`. Lu ainsi, cela
ressemble exactement au motif « seuils : toujours = jamais » : un écart
permanent devenu muet.

C'est faux. Le plancher en vigueur dans le script est **70**, pas 85, et
l'abaissement est délibéré et argumenté sur place — le plancher est un filet
pour une chute brutale, la détection de régression assurant le suivi fin à un
point près. Les lignes lues datent d'avant ce changement. Les scores (76, 77,
82) sont au-dessus du plancher, et le silence est correct.

:::note[Ce que ça enseigne sur la lecture des journaux]
Une ligne de journal dit ce qui était vrai **au moment où elle a été écrite**.
Diagnostiquer une politique à partir de ses anciennes sorties, sans aller lire
la politique en vigueur, fabrique des écarts qui n'existent pas.
:::

## Ce qui reste, et pour qui

Hors de portée d'une session sans accès physique :

- **Redéposer l'archive break-glass sur la clé du coffre.** La sonde notifie en
  priorité haute chaque matin depuis le 01/09 : deux secrets ont changé depuis
  l'archive du 31/08, donc la copie n'ouvre plus la production courante. Clé
  physique et YubiKey requises.
- **Onduleur.** Deux coupures secteur cette année ont reset les trois machines.
- **galahad n'a plus de marge disque** : `/` à 72 % et VG entièrement alloué —
  plus de filet `lvextend`, contrairement à lancelot qui garde 5,12 G.
- **DR drill from cold** et le dossier de réclamation Argon.

## Le garde-fou du garde-fou

Dix expéditeurs de plus, c'est dix choses de plus qui peuvent mourir sans
bruit — et un invité muet ne se distingue pas d'un invité tranquille.
`control-drift-check` vérifie donc, toutes les six heures, que chaque LXC dont
une config `system/alloy/<nom>.alloy` existe dans le dépôt a bien un `alloy`
actif. L'attendu vient du dépôt et non des conteneurs qui tournent : une LXC
neuve n'entre dans le contrôle qu'une fois sa config commitée, sinon chaque
création inventerait une dérive.

Ce contrôle a été **prouvé en le faisant échouer** : Alloy arrêté dans
waterline, script relancé, la dérive apparaît nommément. Sans cette preuve il
serait passé pour bon alors qu'il ne vérifiait rien — la première version était
écrite en `while read ... done < <(on_host ...)`, et comme `on_host` appelle
`ssh`, qui lit stdin, ssh avalait les lignes restantes : **seul le premier
invité était regardé**, les neuf autres jamais consultés, verdict « aucune
dérive ».

:::danger[Un garde-fou qu'on n'a pas vu échouer ne protège rien]
Le vert du premier essai était un vert de complaisance. Il ressemblait
exactement au vert légitime obtenu après correction. La seule façon de faire la
différence est de casser volontairement ce que le contrôle surveille et de
vérifier qu'il crie.
:::

Reste ouvert : ce contrôle atteste qu'Alloy *tourne*, pas que les lignes
*arrivent*. Une règle de dead-man-switch sur le silence par source serait le
cran suivant, mais dix règles de plus recréeraient du bruit et il faut d'abord
mesurer, sur quelques semaines, quelles sources se taisent légitimement — un
serveur de test ne log rien pendant des heures, et c'est normal.
