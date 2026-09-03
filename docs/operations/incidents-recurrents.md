# Incidents recurrents et leurs remedes

Dix incidents deja vecus sur le homelab, avec leur signal de detection, leur
remede exact et sa verification.

:::info[Origine : le catalogue de sucre, retire le 2026-08-25]
Ces fiches viennent du catalogue de patterns de **sucre**, l'assistant SRE
maison (LXC 105 sur lancelot). sucre a tourne du 2026-04-30 au 2026-08-25 :
4 795 incidents observes, 113 reconnaissances correctes, **0 execution**
(le mode « essai a blanc » n'a jamais ete leve), pour 29,70 EUR d'API.

Le service est arrete et desactive, la base d'audit est conservee. Le
catalogue, lui, est le seul actif non reproductible du projet : il encode
des pannes que personne d'autre ne peut connaitre. D'ou cette page.

La detection passe desormais par Pulse Patrol. Les remedes ci-dessous
restent valables quel que soit l'outil qui leve l'alerte.
:::

## Par frequence reellement observee

Les compteurs viennent de la table `proposals` de sucre, sur 4 mois de
fonctionnement continu. **Ils sont figes depuis le 2026-08-25** : sucre est
arrete (voir [Bilan et arret](../projet/sucre.md#bilan-et-arrêt)), plus rien ne
les alimente. Les entrees ajoutees apres cette date portent `—`.

| Incident | Matches en 4 mois | Risque du remede |
|---|---|---|
| [Conteneurs a l'arret apres reboot](#conteneurs-a-larret-apres-un-reboot) | 84 | Faible |
| [Traefik : provider docker en EOF](#traefik--provider-docker-en--unexpected-eof-) | 23 | Faible |
| [AdGuard secondaire desynchronise](#adguard-secondaire-desynchronise) | 5 | Faible |
| [pmxcfs bloque en lecture seule](#pmxcfs-bloque-en-lecture-seule-apres-recovery) | 1 | Moyen |
| [Beszel : page blanche apres OIDC](#beszel--page-blanche-apres-le-flux-oidc) | 0 | Faible |
| [Loki injoignable (LXC 101)](#loki-injoignable-lxc-101) | 0 | Moyen |
| [dockerd en boucle de SIGBUS](#dockerd-en-boucle-de-sigbus) | 0 | **Eleve** |
| [Mises a jour de securite en attente](#mises-a-jour-de-securite-en-attente) | 0 | Moyen |
| [WAN coupe cote operateur](#wan-coupe-cote-operateur) | 0 | Aucun (diagnostic) |
| [Bruit auditd EXECVE sur galahad](#bruit-auditd-execve-sur-galahad) | 0 | Aucun (diagnostic) |
| [Regle Grafana orpheline apres retrait d'un service](#regle-grafana-orpheline-apres-retrait-dun-service) | — | Faible |
| [Un « penny » de plus dans l'app Claude](#penny-en-double) | — | Faible |
| [Chaine egress presente mais branchee sur rien](#egress-orpheline) | — | Faible |
| [Services ZFS en echec dans un LXC](#zfs-lxc) | — | Aucun (masquage) |
| [Chute de lancelot : ou est la preuve](#chute-lancelot-preuve) | — | Aucun (diagnostic) |

---

## Conteneurs a l'arret apres un reboot

**84 matches.** L'incident le plus frequent du homelab, et de loin.

**Symptome.** Des conteneurs restent `exited` alors que le daemon Docker
tourne. `systemctl status docker` est vert, la stack est partiellement morte.

**Cause.** `restart: unless-stopped` ne ramene **pas** un conteneur arrete via
`docker compose down`, meme apres un redemarrage du daemon. Le flag « stoppe
volontairement » survit au reboot.

**Detection.** Evenement Docker `die`, puis etat `exited` avec
`RestartCount == 0`. Le `RestartCount` a zero est la signature : un conteneur
tombe tout seul aurait un compteur non nul.

**Remede.** Idempotent, sans risque, y compris sur un conteneur deja demarre.

```bash
cd /mnt/ssd/config/docker
docker compose up -d              # toute la stack
docker compose up -d <service>    # ou un seul service
```

**Verification.** `docker compose ps` : plus aucun service en `exited`.

:::tip[Consequence en cascade a connaitre]
AdGuard vit dans cette stack. Une stack a terre coupe donc le DNS de tous
les LXC. Un message « backup vault perime » est souvent le symptome visible
d'une stack a terre, pas un probleme de sauvegarde.
:::

:::note[Automatisé depuis le 2026-08-30 — mais lire avant d'agir]
`check_containers_restart` relance désormais les conteneurs arrêtés tout seul,
2 minutes après détection, avec un disjoncteur de 3 relances par conteneur et par
24 h. Il fait `docker start` et **jamais** `docker compose up -d` : le dépôt est
la production, on ne recrée pas depuis le checkout courant sans le demander.

Conséquences pratiques quand tu arrives sur l'incident :

- si tu vois des conteneurs `exited` depuis moins de 2 min, **attends** plutôt que
  de lancer la commande à la main — sinon tu cours contre la sonde ;
- si un conteneur est en `restarting`, la sonde n'y touche pas volontairement : il
  réessaie déjà seul, et le bousculer masquerait sa vraie cause (un backend mort,
  par exemple) ;
- si l'alerte `container-restart-capped` est partie, la sonde a abandonné après
  3 essais : c'est là qu'un humain est réellement nécessaire.

Le `docker compose up -d` ci-dessus reste le bon remède pour un conteneur
**supprimé** (et non simplement arrêté), cas que la sonde ne couvre pas
délibérément. Voir [monitoring](./monitoring.md#reprise-ssd).
:::

---

## Traefik : provider docker en « unexpected EOF »

**23 matches.**

**Symptome.** Traefik logue en boucle `unexpected EOF` ou
`Cannot connect to the Docker daemon` avec `Provider error`. Le routage se
degrade au fur et a mesure que la configuration dynamique se perime.

**Cause.** Ce n'est pas Traefik : c'est **socket-proxy** qui est tombe (crash,
OOM, recreate). Traefik retente seul et se reconnecte des le retour du proxy.

:::warning[Relancer Traefik est le mauvais reflexe]
Le premier brouillon automatique de ce remede relancait Traefik : coupure
HTTP complete, et le mauvais composant. Corrige a la revue humaine du
2026-07-07. On vise socket-proxy, la cause racine, sans aucune coupure.
:::

**Remede.**

```bash
cd /mnt/ssd/config/docker

# 1. Le provider s'est-il deja rétabli seul ?
docker logs --since 5m traefik 2>&1 \
  | grep -cE 'unexpected EOF|Cannot connect to the Docker daemon'
# 0 -> rien a faire, c'etait un recreate de maintenance

# 2. Sinon, etat de socket-proxy
docker inspect -f '{{.State.Status}} {{.State.Health.Status}}' socket-proxy

# 3. S'il n'est pas running, ou unhealthy
docker compose up -d socket-proxy
```

**Verification.** Plus d'erreur `Provider error` dans les logs Traefik sur les
5 dernieres minutes.

**Escalade.** socket-proxy sain mais Traefik logue encore : creuser a la main,
ce n'est pas ce pattern.

---

## AdGuard secondaire desynchronise

**5 matches.**

**Symptome.** Le secondaire (`dns-failover`, LXC 100, 192.168.1.30) resout mal
les noms du LAN, ou part en timeout.

**Remede.** `adguard-sync.sh` pousse la configuration du primaire vers le
secondaire via l'API. Idempotent, sans coupure DNS : le primaire reste
autoritaire pendant la synchronisation.

```bash
/root/adguard-sync.sh
```

:::danger[Le piege de version, verifie avant de synchroniser]
`adguard-sync` recopie **la configuration entiere** du primaire (Docker,
image `latest`) vers le secondaire (installation native). Si les deux
versions divergent, le schema de configuration ne correspond plus et le
secondaire part en boucle de crash. Un garde-fou de version existe
(PR #38). En cas de casse, la recuperation passe par une installation
manuelle du binaire.
:::

---

## pmxcfs bloque en lecture seule apres recovery

**1 match.**

**Symptome.** `corosync` annonce `Quorate: Yes`, et pourtant `/etc/pve` reste
en lecture seule sur le noeud qui vient de revenir. Typique d'un cluster a
deux noeuds apres le retour du partenaire.

**Detection.** `Quorate: Yes` dans les logs corosync **et**
`pve_pmxcfs_writable == 0`.

**Remede.** A jouer sur le noeud revenu, pas sur l'autre.

```bash
systemctl restart pve-cluster

# verification
touch /etc/pve/.check && rm -f /etc/pve/.check && echo "/etc/pve writable"
```

**Risque : moyen.** Breve coupure de l'API de management (~5 s). Aucune
interruption des VM ni des LXC.

---

## Beszel : page blanche apres le flux OIDC

**Symptome.** Page blanche apres authentification Authelia. Le conteneur est
`running`, donc l'etat de sante Docker ne sert a rien.

**Cause.** PocketBase remet `meta.appURL` a zero a chaque redemarrage.

**Detection.** `meta.appURL` dans les logs du conteneur, ou sonde HTTP a 500
sur `monitor.home.gabin-simond.fr` alors que le conteneur tourne.

**Remede.** `UPDATE` SQL idempotent, sans perte de donnees.

```bash
docker exec beszel sqlite3 /pb_data/data.db \
  "UPDATE _params SET value='https://monitor.home.gabin-simond.fr' WHERE key='meta.appURL';"
docker compose restart beszel
```

Le redemarrage du conteneur est une etape manuelle, volontairement absente du
script de remede.

---

## Loki injoignable (LXC 101)

**Symptome.** Les tableaux de bord de logs Grafana sont vides, l'endpoint de
sante de Loki ne repond pas 200.

**Remede.** Depuis lancelot, via `pct exec` sur le LXC 101.

```bash
# 1. Confirmer, avant de toucher a quoi que ce soit
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 8 http://192.168.1.31:3100/ready
# 200 -> deja sain, ne rien faire

# 2. Depuis lancelot
pct status 101
pct exec 101 -- bash -lc 'cd /opt/logs && docker compose restart loki'
```

**Risque : moyen.** Trou d'ingestion de logs de 10 a 30 s, visible dans
Grafana. Pas de perte de donnees, le WAL de Loki preserve les chunks en vol.

:::note[Chemin du compose]
Le compose est dans `/opt/logs/`, et ce repertoire **n'est pas versionne**.
Le renommage `observability` vers `logs` a laisse des chemins perimes
ailleurs. L'acces se fait par Tailscale SSH vers lancelot
(100.69.6.13) puis `pct exec 101`, pas par l'IP du LAN.
:::

---

## dockerd en boucle de SIGBUS

:::danger[Risque eleve : coupure de tous les conteneurs de penny]
Ce remede redemarre Docker, soit environ 30 s d'indisponibilite de **tous**
les conteneurs de penny. Jamais en automatique, toujours avec accord
explicite et dans une fenetre de maintenance.
:::

**Symptome.** `SIGBUS` ou `signal: bus error` dans les logs de `docker.service`,
avec au moins 3 redemarrages en une heure.

**Cause.** Bug recurrent de `mmap` entre lecteur et ecrivain journald sur ARM.
Vu sur dockerd le 2026-04-19, sur fail2ban-authelia le 2026-04-26. Le remede
de classe est de sortir du chemin journald.

**Remede.**

```bash
cp -a /etc/docker/daemon.json /etc/docker/daemon.json.bak.$(date +%s)

jq '. + {"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' \
  /etc/docker/daemon.json > /tmp/daemon.json && mv /tmp/daemon.json /etc/docker/daemon.json

systemctl restart docker
```

:::warning[La limite ne s'applique qu'aux conteneurs recrees]
Poser `max-size` dans `daemon.json` ne rétroagit pas. Les conteneurs
existants gardent leur journal sans limite jusqu'a leur recreation. Un
`json.log` de 982 Mo a deja sature un LXC et fait disparaitre un conteneur
pendant 3 jours et demi.
:::

---

## Mises a jour de securite en attente

**Detection.** `node_apt_upgrades_pending > 0`, ou le verificateur cron dans
Loki.

**Remede.** Sur penny, galahad ou lancelot.

```bash
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold"
```

**Risque : moyen.** Un `apt upgrade` peut declencher le redemarrage de services
(dkms, systemd). A jouer en fenetre de maintenance.

:::danger[Sur penny, ne pas lancer depuis la session SSH]
Le `postinst` de tailscale redemarre `tailscaled` et tue la session, donc
l'`apt` en cours, en pleine phase `Setting up`. Passer par `systemd-run`
pour sortir du cgroup de la session. Voir
[Maintenance et depannage](depannage.md).
:::

---

## WAN coupe cote operateur

**Diagnostic seulement.** Une panne operateur n'est pas automatisable.

**Symptome.** La Freebox repond (LAN sain) mais `1.1.1.1` et `9.9.9.9` sont
injoignables. Les sauvegardes cloud, ntfy, Let's Encrypt et Watchtower vont
tous echouer et declencher une cascade d'alertes.

**Remede.** Constater, puis suspendre les timers dependants du WAN le temps de
la panne pour eviter la cascade.

```bash
ping -c3 -W2 192.168.1.254      # Freebox : LAN sain ?
ping -c3 -W3 1.1.1.1            # WAN
ping -c3 -W3 9.9.9.9

# suspendre les timers dependants du WAN
systemctl stop restic-check-monthly.timer restic-drill-monthly.timer \
               trivy-scan.timer digest-drift-check.timer
```

Ne pas oublier de les relancer au retour du WAN.

:::note[Freebox injoignable = ce n'est plus ce pattern]
Si la Freebox elle-meme ne repond pas, le probleme est sur le LAN, pas chez
l'operateur.
:::

---

## Bruit auditd EXECVE sur galahad

**Diagnostic seulement, aucune remediation n'a de sens.**

**Symptome.** Le journal d'audit de galahad emet des evenements `EXECVE` pour
`/usr/bin/grep` avec l'argument `warning:`. Bruit benin : une tache cron ou une
unite systemd sous surveillance auditd qui grep ses propres logs.

**Traitement.**

```bash
auditctl -l                     # quelle regle declenche ?
```

Puis, au choix : restreindre la regle (exclure `/usr/bin/grep` du chemin
surveille, ou ajouter une cle de filtrage), ou accepter le bruit et supprimer
la regle. Cette fiche existe pour eviter qu'un outil de detection ne classe ce
bruit comme un incident.

---

## Trois lecons du catalogue

:::warning[Un remede jamais execute n'est pas un remede teste]
A l'arret de sucre, **4 des 10 fiches pointaient vers un script de remede
inexistant** : `adguard-desync`, `audit-execve-grep-warning-noise`,
`internet-wan-down` et `loki-lxc-down` referencaient `<nom>.sh` alors que le
fichier sur disque s'appelle `<nom>-fix.sh`. Le bug avait deja ete trouve et
corrige une fois sur `traefik-docker-provider-eof` le 2026-07-07, sans que
personne pense a verifier les autres.

Rien ne l'a signale pendant quatre mois, parce que rien n'a jamais tente de
les executer. Un chemin de code jamais emprunte se degrade en silence.
:::

:::warning[Le brouillon automatique se trompe de composant]
Le remede genere pour l'EOF de Traefik relancait Traefik, ce qui coupe le
HTTP sans corriger la cause. Un remede propose par un modele doit etre relu
par un humain avant d'avoir le droit de s'executer, meme quand la detection
est juste.
:::

:::warning[Un signal sans exutoire ne coute pas rien]
98 % des appels au modele portaient sur des incidents sans fiche
correspondante : 27,88 EUR des 29,70 EUR depenses. Le filtrage par
catalogue devait passer **avant** l'appel au modele, pas apres.
:::

---

## Regle Grafana orpheline apres retrait d'un service

**Symptome.** Un flot de notifications ntfy sur un service qu'on vient d'arreter
volontairement, en `FIRING`/`RESOLVED` alternes. Observe le 2026-08-26 : 38
notifications en 24 heures, **60 % du trafic du topic**, pour la regle
« Sucre — silence Loki » alors que sucre etait arrete depuis la veille.

**Cause.** Le provisioning Grafana ne **supprime jamais** une regle absente de
`rules.yml` : il ne fait que creer et mettre a jour ce qu'il y trouve. La regle
survit dans `grafana.db` avec `is_paused=0` et continue de s'evaluer, a travers
les redemarrages.

Le battement, lui, vient d'ailleurs : Alloy tournait encore dans le LXC du service
arrete, donc des logs sporadiques frolaient le seuil dans les deux sens. **Un
dead-man-switch sur une machine allumee mais videe de son service ne reste pas
allume, il clignote** — et chaque transition est une notification.

**Detection.** Comparer les `uid` du fichier a ceux de la base. Un ecart = une
orpheline.

```bash
tailscale ssh root@lancelot \
  "pct exec 101 -- sqlite3 /opt/logs/grafana/grafana.db \
   'SELECT uid, title FROM alert_rule'"
```

Depuis le 2026-08-26, `logs/deploy-to-lxc101.sh` fait ce controle a chaque
deploiement et echoue en affichant le bloc a coller.

**Remede.** Nommer les `uid` dans un bloc `deleteRules` de `rules.yml`, puis
redeployer. Recette detaillee et pieges dans
[Grafana → retirer une regle d'alerte](../services/grafana.md#retirer-une-règle-dalerte).

Un `DELETE` SQL direct dans `grafana.db` ne tient pas : le provisioning est
reapplique a chaque demarrage et la regle reviendrait.

---

## Un « penny » de plus dans l'app Claude {#penny-en-double}

**Symptome.** Deux appareils « penny » cote a cote dans l'app Claude, l'ancien
mort, le nouveau vivant. Aucune conversation perdue, mais l'historique de
l'appareil repart de zero.

**Cause.** Le serveur `claude-remote` relit son identite dans
`~/.claude/projects/-root/bridge-pointer.json` au demarrage. Il valide ce
fichier **en bloc** : si une seule de ses cinq cles manque, ou si son mtime
depasse 4 h, il jette le fichier entier — `environmentId` compris — et
enregistre un environnement neuf. Detail du mecanisme dans
[Claude Remote → le pointeur est l'ancre d'identite](../services/claude-remote.md#pointeur-ancre-identite).

**Detection.** Le verdict est explicite dans le log du serveur. Le filtre
`bridge:ws` retire l'echo : le bridge journalise le texte de chaque commande
lancee en session, donc chercher ce motif l'ecrit dans le fichier qu'on lit.

```bash
grep -a 'invalid schema, clearing' /var/lib/claude-remote/server-debug.log \
  | grep -av 'bridge:ws'
```

Une ligne = l'identite a ete perdue a ce demarrage. Le demarrage precedent est
dans `server-debug.log.1`, ce qui permet de comparer avec un cas sain, ou la
ligne attendue est `Found prior environment … requesting reuse`.

**Remede.** Il n'y en a pas de propre une fois le fait accompli : l'ancien
environnement ne se recupere pas depuis penny. Adopter le nouvel identifiant
et supprimer l'appareil mort dans l'app.

**Prevention.** Ne jamais editer le pointeur en supprimant une cle. Changer une
valeur en gardant les cinq est la seule edition sure.

:::warning[Un garde-fou qui relit le fichier qu'il vient d'ecrire ne verifie rien]
Le controle `--verify` de `penny-arm-reset-forensics.sh` lisait
`bridge-pointer.json` et annoncait « environmentId preservee ». Il confirmait
sa propre ecriture. Le serveur, lui, avait deja decide de jeter le fichier :
le premier `--verify` lance ~20 s apres le boot est sorti **tout vert** alors
que l'identite etait deja perdue.

La source de verite est le verdict du **consommateur**, pas le fichier qu'on
vient de produire. Et l'absence de verdict ne veut pas dire « tout va bien »,
elle veut dire « trop tot pour conclure » — le controle corrige echoue
desormais dans ce cas au lieu d'afficher un vert.

Meme famille que la
[regle Grafana orpheline](#regle-grafana-orpheline-apres-retrait-dun-service) :
le garde-fou surveillait le mauvais artefact.
:::

---

## Chaine egress presente mais branchee sur rien {#egress-orpheline}

**Constate le 2026-09-03 sur lancelot, apres un redemarrage a 01:42.**
Le pare-feu de sortie n'a rien applique pendant sept heures, et le controle de
derive repondait « present ».

`egress-phase2-boot.service` echoue au demarrage avec :

```
Can't lock /run/xtables.lock: Resource temporarily unavailable
```

Le script tourne en `set -e` : il s'arrete **avant** de brancher la chaine sur
`OUTPUT`. On obtient donc une chaine `EGRESS-PHASE2` complete — ses 20 regles
sont la — mais aucun saut vers elle. Une chaine branchee sur rien ne filtre
rien.

:::danger[Compter des lignes n'est pas mesurer un effet]
`control-drift-check` faisait `iptables -S | grep -c EGRESS` et se contentait
d'un resultat non nul. La chaine orpheline lui repondait « 20 », donc
« deploye ». Il verifie desormais **aussi** le saut depuis `OUTPUT`.

L'incident n'a ete vu que parce qu'un AUTRE controle, celui des units en
echec, a signale le service a 06:00. Un simple `systemctl reset-failed`
l'aurait rendu totalement muet.
:::

### Diagnostic

```bash
# La chaine existe-t-elle ?
ssh <noeud> 'sudo iptables -S EGRESS-PHASE2 | grep -c "^-A"'   # attendu : 20

# Est-elle BRANCHEE ? C'est la question qui compte.
ssh <noeud> 'sudo iptables -S OUTPUT | grep -c "j EGRESS-PHASE2"'   # attendu : 1
```

Forme attendue de `OUTPUT` sur un noeud PVE — le saut egress **avant** celui
de pve-firewall :

```
-P OUTPUT ACCEPT
-A OUTPUT -j EGRESS-PHASE2
-A OUTPUT -j PVEFW-OUTPUT
```

### Remede

```bash
ssh <noeud> 'sudo systemctl start egress-phase2-boot.service'
ssh <noeud> 'sudo systemctl show egress-phase2-boot.service -p Result --value'  # success
```

Le service reconstruit la chaine entiere, ce qui est idempotent. En cas de
doute, armer un filet avant — c'est ce qui a ete fait le 2026-09-03 :

```bash
systemd-run --on-active=240 --unit=egress-net /bin/sh -c \
  "/sbin/iptables -w 10 -D OUTPUT -j EGRESS-PHASE2; /sbin/iptables -w 10 -I OUTPUT 1 -j EGRESS-PHASE2"
```

### Cause de fond, corrigee

L'unit ordonnait deja `After=pve-firewall.service`, et cela ne suffit pas :
pve-firewall **demarre** avant, puis continue de reappliquer ses regles.
L'ordre ne supprime pas la course, l'attente si. Les appels du script passent
maintenant par `iptables -w 15`, pose en une fonction qui intercepte les 32
sites d'appel.

---

## Services ZFS en echec dans un LXC {#zfs-lxc}

**Constate le 2026-09-03 dans le LXC 103 (pbs)** : `zfs-zed.service` en echec
12 fois en 30 minutes, plus `zfs-mount` et `zfs-share`, ce qui declenche
l'alerte « unit en crash-loop ».

Il n'y a pas de `/dev/zfs` dans un LXC non privilegie, donc ces services ne
peuvent structurellement pas demarrer. `zfsutils-linux` arrive comme
dependance de `proxmox-backup-server` : le paquet est la, la fonctionnalite
non.

Cela echouait probablement depuis toujours **sans que rien ne le dise** : ce
LXC n'expediait pas ses journaux vers Loki avant le 2026-09-02. La premiere
nuit de collecte a suffi a le reveler — c'est l'observabilite qui a cree
l'alerte, pas la panne qui est apparue.

### Remede

```bash
pct exec <id> -- systemctl mask zfs-zed.service zfs-mount.service zfs-share.service
pct exec <id> -- systemctl reset-failed zfs-zed.service zfs-mount.service zfs-share.service
```

Masquer plutot que desactiver : `mask` empeche aussi un demarrage declenche
par une dependance. A refaire si un jour ZFS est reellement utilise dans le
conteneur (Phase 4 de la roadmap).

---

## Chute de lancelot : ou est la preuve {#chute-lancelot-preuve}

Lancelot tombe sans laisser de trace dans `journald` : le journal s'arrete net
et la machine revient une minute plus tard. **Ce ne sont pas des coupures
franches, ce sont des paniques noyau** — et la preuve n'est pas la ou on la
cherche d'instinct.

:::danger[`/sys/fs/pstore` vide ne prouve RIEN]
`systemd-pstore` **deplace** les enregistrements au demarrage vers
`/var/lib/systemd/pstore/<epoch>/`. Trouver `/sys/fs/pstore` vide et en
conclure « pas de panique » est une erreur — elle a ete commise le 2026-09-03,
puis corrigee en trouvant 35 fragments de dump dans `/var/lib`.

Deuxieme piege dans le meme dossier : le dmesg y est fragmente en `Part<N>`
sur des dizaines de fichiers. Un `grep` sur un seul fragment ne rend presque
rien ; il faut balayer tout le repertoire.
:::

```bash
# LE bon endroit
ssh lancelot 'sudo ls -la /var/lib/systemd/pstore/'

# La signature, en balayant tous les fragments
ssh lancelot 'sudo sh -c "for f in \$(find /var/lib/systemd/pstore/<epoch> -type f); do
  grep -ahoE \"Kernel panic[^,]*|RIP: [^ ]+|CPU: [0-9]+.{0,60}Comm: [^ ]+\" \$f; done | sort -u"'
```

### Trois episodes, trois RIP sans rapport

| Date | RIP | Contexte |
|---|---|---|
| 2026-07-10 | `cpuidle_enter_state+0xc7` | inactivite CPU |
| 2026-08-05 | `update_sd_lb_stats+0x93` | equilibrage d'ordonnancement |
| 2026-09-03 | `vma_interval_tree_remove+0x1a4` | arbre des zones memoire, processus `smartctl` en fin de vie |

**C'est le motif qui parle.** Un bug logiciel frappe le meme chemin de code ;
une corruption memoire aleatoire frappe n'importe ou. Trois sous-systemes sans
rapport pointent vers le materiel — RAM non-ECC sur un ZimaBoard2, alors que
galahad, meme modele et meme noyau, est indemne.

Le 2026-09-03, penny et galahad avaient 4 jours d'uptime au moment de la chute :
un evenement electrique est exclu par construction.

:::caution[`ce_count`/`ue_count` a 0 ne dedouane pas la RAM]
Sur de la memoire **non-ECC**, il n'y a aucune capacite de detection. Zero
erreur EDAC signifie « rien n'a ete mesure », pas « rien ne s'est passe ».
C'est exactement pourquoi `memtest86+` — deja installe — reste le seul examen
concluant, et pourquoi il faut le lancer plutot que d'accumuler des compteurs
rassurants.
:::

### L'echelle de diagnostic, du moins cher au plus cher

**1. `memtester` en espace utilisateur — aucune indisponibilite.** Installe sur
lancelot. Il verrouille une portion de RAM et la torture sans arreter la
machine, avec un resultat lisible dans le journal :

```bash
ssh lancelot 'sudo systemd-run --unit=memtest-userspace \
  /usr/sbin/memtester 6G 1'
ssh lancelot 'sudo journalctl -u memtest-userspace -f'
```

Ses limites, a garder en tete : il ne teste que la memoire qu'il arrive a
allouer, jamais celle que le noyau occupe, et il ne peut pas exercer les
motifs bas niveau d'un test au boot. **Une passe verte ne dedouane donc pas la
RAM** — c'est un filtre, pas une preuve. Une passe ROUGE, elle, conclut
immediatement et evite tout le reste.

Passe du 2026-09-03 : 6 Go verrouilles, une boucle, 24 minutes, **0 echec**,
`Result=success`, machine saine apres coup. Filtre negatif, donc la question
reste ouverte et l'etape 2 reste necessaire.

**2. `memtest86+` au demarrage — immobilise la machine.** C'est le seul examen
concluant. Deux precautions.

:::warning[Ne pas armer `grub-reboot` a l'avance]
`grub-reboot` vise le PROCHAIN demarrage. Or cette machine tombe justement
toute seule : si elle panique dans la nuit, elle revient dans memtest et y
reste, hors ligne, avec Loki primary, Grafana, PBS et le runner de CI dedans.
On arme au moment ou on est devant, pas avant.
:::

L'entree a preferer est la variante **serial console** — lancelot a un UART
(`ttyS0`, 16550A a 0x3f8) et memtest86+ sait y ecrire, donc le resultat est
lisible sans ecran **si** un cable est branche en face :

```
Memory test (memtest86+x64.efi, serial console)
```

Sans cable, il faut un ecran sur le mini-DP : memtest86+ n'ecrit aucun
resultat sur disque, et personne ne pourra lire le verdict a distance.

### Consequence a surveiller apres chaque chute

Un redemarrage de lancelot rejoue `egress-phase2-boot.service`, qui peut echouer
sur le verrou xtables : verifier le pare-feu de sortie, voir
[chaine egress branchee sur rien](#egress-orpheline).

Et les sauvegardes : la chute du 2026-09-03 a 01:42 a rendu PBS injoignable a
01:43, quinze minutes avant la fenetre de 02:00. Elles ont toutes reussi ce
soir-la (9 invites, job « finished successfully » a 02:07), mais c'est le
premier controle a faire — pas une evidence.
