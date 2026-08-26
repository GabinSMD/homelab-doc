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
fonctionnement continu.

| Incident | Matches en 4 mois | Risque du remede |
|---|---|---|
| [Conteneurs a l'arret apres reboot](#conteneurs-a-larret-apres-un-reboot) | 84 | Faible |
| [Traefik : provider docker en EOF](#traefik-provider-docker-en-unexpected-eof) | 23 | Faible |
| [AdGuard secondaire desynchronise](#adguard-secondaire-desynchronise) | 5 | Faible |
| [pmxcfs bloque en lecture seule](#pmxcfs-bloque-en-lecture-seule-apres-recovery) | 1 | Moyen |
| [Beszel : page blanche apres OIDC](#beszel-page-blanche-apres-le-flux-oidc) | 0 | Faible |
| [Loki injoignable (LXC 101)](#loki-injoignable-lxc-101) | 0 | Moyen |
| [dockerd en boucle de SIGBUS](#dockerd-en-boucle-de-sigbus) | 0 | **Eleve** |
| [Mises a jour de securite en attente](#mises-a-jour-de-securite-en-attente) | 0 | Moyen |
| [WAN coupe cote operateur](#wan-coupe-cote-operateur) | 0 | Aucun (diagnostic) |
| [Bruit auditd EXECVE sur galahad](#bruit-auditd-execve-sur-galahad) | 0 | Aucun (diagnostic) |

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
