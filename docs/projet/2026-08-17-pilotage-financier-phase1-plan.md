# Pilotage financier — plan d'implémentation, phase 1 (socle)

> **Pour un agent exécutant :** SOUS-SKILL REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**Objectif** : disposer d'un Firefly III auto-hébergé, joignable en HTTPS
derrière Authelia, sauvegardé et restaurable — utilisable immédiatement en
saisie manuelle.

**Architecture** : un LXC non privilégié dédié sur galahad, Docker à
l'intérieur, Firefly III + PostgreSQL en Compose. Traefik (sur penny) route
vers l'IP LAN du LXC via son provider fichier. Sauvegarde par `pg_dump` +
restic depuis le LXC, plus le LXC dans PBS.

**Pile technique** : Proxmox LXC (Debian 13), Docker + Compose, Firefly III
v6.6.6, PostgreSQL 17, Traefik v3 (provider fichier), Authelia, restic,
systemd timers.

**Spec** : `docs/projet/2026-08-17-pilotage-financier-design.md`

## Contraintes globales

Valeurs exactes, à ne pas réinterpréter :

- Domaine : `finance.home.gabin-simond.fr`
- Résolveur ACME Traefik : **`letencrypt`** — c'est l'orthographe réellement
  utilisée dans le dépôt, pas une faute à corriger. La changer casse le
  certificat.
- Middlewares Traefik : `authelia@docker`, `security-headers@file`
- Nœud d'hébergement : **galahad** (jamais penny, jamais lancelot)
- Chemin dans le LXC : `/opt/finance/`
- Fuseau : `Europe/Paris` · Langue : `fr_FR` · Devise : `EUR`
- Sauvegarde : restic, dépôt `restic-finance`, rétention **7 quotidiennes /
  4 hebdomadaires / 6 mensuelles**, identifiants dans `/root/.restic-env`
- Planification : **systemd timers avec `Persistent=true`**, jamais `cron`.
  Un timer non `Persistent` saute silencieusement si la machine est éteinte à
  l'heure dite — c'est ce qui a fait rater le drill du 1er juin.
- Images conteneur : **épinglées par digest**, comme le reste du dépôt.

## Trois écarts assumés par rapport au spec

1. **L'importer n'est pas déployé en phase 1.** Sans connexion bancaire il
   n'a rien à faire. Il arrive en phase 2 avec Enable Banking.
2. **Pas de conteneur `cron`.** Deux timers systemd sur l'hôte du LXC, pour
   suivre la convention du dépôt.
3. **L'API n'est pas exposée par Traefik du tout** — voir la tâche 4, qui
   explique pourquoi c'est plus sûr que l'exclusion prévue au spec, et qui
   met le spec à jour.

## Structure des fichiers

| Fichier | Dépôt | Responsabilité |
|---|---|---|
| `docker/finance/docker-compose.yml` | homelab-config | la pile Firefly III + Postgres |
| `docker/finance/.env.example` | homelab-config | les variables attendues, sans valeur |
| `traefik/dynamic/finance.yml` | homelab-config | le routage depuis penny |
| `scripts/finance-backup.sh` | homelab-config | `pg_dump` + restic + notification |
| `system/finance/*.service` `*.timer` | homelab-config | les trois timers |
| ce plan | homelab-doc | trace des valeurs retenues |

Le vrai `.env` vit **uniquement dans le LXC**, jamais dans git.

## Valeurs retenues

À compléter à la tâche 1, après vérification. Ne pas présumer que ces
valeurs sont libres.

| Paramètre | Valeur | Vérifié le |
|---|---|---|
| ID du LXC | `109` (à confirmer) | |
| IP LAN | `192.168.1.34` (à confirmer) | |
| Nom d'hôte | `finance` | |

---

## Note sur la forme des tests

Il n'y a pas de suite de tests unitaires ici : le livrable est de
l'infrastructure. L'équivalent honnête du cycle TDD est appliqué à chaque
tâche : **on écrit d'abord la commande de vérification, on la lance pour la
voir échouer, on implémente, on la relance pour la voir passer.** Une tâche
dont la vérification passait déjà avant l'implémentation n'a rien prouvé.

---

## Tâche 1 : créer le LXC sur galahad

**Fichiers**
- Modifier : `docs/projet/2026-08-17-pilotage-financier-phase1-plan.md` (le
  tableau « Valeurs retenues »)

**Interfaces**
- Produit : un LXC démarré, joignable en SSH depuis penny, dont l'ID et l'IP
  sont consignés. Les tâches 2 à 6 s'y connectent.

- [ ] **Étape 1 : vérifier que l'ID et l'IP visés sont libres**

Depuis penny :

```bash
ssh galahad 'pct list'
ping -c2 -W1 192.168.1.34
```

Attendu : `109` **absent** de la liste, et le ping **sans réponse**
(`100% packet loss`). Si l'un des deux est pris, prendre l'ID libre suivant
et l'IP libre suivante, puis les consigner à l'étape 6.

- [ ] **Étape 2 : vérifier le piège `UMASK`**

```bash
ssh galahad 'grep -E "^UMASK" /etc/login.defs'
```

Si la valeur est `027`, `pct create --unprivileged` **échouera**. Corriger
avant de continuer :

```bash
ssh galahad 'sed -i "s/^UMASK.*/UMASK 022/" /etc/login.defs && grep ^UMASK /etc/login.defs'
```

Attendu après correction : `UMASK 022`.

- [ ] **Étape 3 : créer le LXC**

`nesting=1` et `keyctl=1` ne sont pas optionnels : sans eux, Docker ne
démarre pas dans un LXC non privilégié.

```bash
ssh galahad 'pct create 109 local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst \
  --hostname finance \
  --cores 2 --memory 3072 --swap 1024 \
  --rootfs local-lvm:16 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.34/24,gw=192.168.1.1 \
  --features nesting=1,keyctl=1 \
  --unprivileged 1 \
  --onboot 1 \
  --start 1'
```

Si le template n'existe pas, le télécharger d'abord :
`ssh galahad 'pveam update && pveam available | grep debian-13'` puis
`pveam download local <nom exact>`.

- [ ] **Étape 4 : relancer la vérification de l'étape 1**

```bash
ssh galahad 'pct list | grep 109'
ping -c2 -W1 192.168.1.34
```

Attendu : le LXC apparaît en `running`, et le ping **répond**.

- [ ] **Étape 5 : préparer l'accès et les paquets de base**

```bash
ssh galahad 'pct exec 109 -- bash -c "apt-get update -qq && apt-get install -y -qq curl ca-certificates gnupg postgresql-client restic"'
ssh galahad 'pct exec 109 -- restic version'
```

Attendu : une version de restic s'affiche.

- [ ] **Étape 6 : consigner les valeurs et commiter**

Remplir le tableau « Valeurs retenues » de ce document avec les valeurs
réellement utilisées et la date.

```bash
cd /mnt/ssd/homelab-doc
git add docs/projet/2026-08-17-pilotage-financier-phase1-plan.md
git commit -m "docs(projet): consigner ID et IP du LXC finance"
```

---

## Tâche 2 : installer Docker dans le LXC

**Fichiers**
- Aucun fichier de dépôt. Action sur le LXC uniquement.

**Interfaces**
- Consomme : le LXC de la tâche 1.
- Produit : `docker` et `docker compose` fonctionnels dans le LXC.

- [ ] **Étape 1 : écrire la vérification et la voir échouer**

```bash
ssh galahad 'pct exec 109 -- docker run --rm hello-world'
```

Attendu : échec, `docker: command not found`.

- [ ] **Étape 2 : installer Docker depuis le dépôt officiel**

```bash
ssh galahad 'pct exec 109 -- bash -c "
install -m 0755 -d /etc/apt/keyrings &&
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc &&
chmod a+r /etc/apt/keyrings/docker.asc &&
echo \"deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \$(. /etc/os-release && echo \$VERSION_CODENAME) stable\" > /etc/apt/sources.list.d/docker.list &&
apt-get update -qq &&
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"'
```

- [ ] **Étape 3 : relancer la vérification**

```bash
ssh galahad 'pct exec 109 -- docker run --rm hello-world'
ssh galahad 'pct exec 109 -- docker compose version'
```

Attendu : `Hello from Docker!`, puis une version de Compose.

Si Docker refuse de démarrer, la cause est presque toujours
`nesting`/`keyctl` absents — revenir à la tâche 1, étape 3, et vérifier avec
`ssh galahad 'pct config 109 | grep features'`.

- [ ] **Étape 4 : pas de commit**

Cette tâche ne produit aucun artefact versionné. Ne rien commiter.

---

## Tâche 3 : la pile Firefly III + PostgreSQL

**Fichiers**
- Créer : `homelab-config/docker/finance/docker-compose.yml`
- Créer : `homelab-config/docker/finance/.env.example`

**Interfaces**
- Consomme : Docker dans le LXC (tâche 2).
- Produit : Firefly III répondant en HTTP sur `192.168.1.34:8080`, base
  `firefly` dans un Postgres nommé `db`. La tâche 4 route vers ce port ; la
  tâche 5 sauvegarde cette base.

- [ ] **Étape 1 : écrire la vérification et la voir échouer**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.1.34:8080/login
```

Attendu : échec de connexion (`Connection refused`).

- [ ] **Étape 2 : relever les digests des images**

Le dépôt épingle les images par digest. Relever les valeurs du jour :

```bash
ssh galahad 'pct exec 109 -- bash -c "
docker pull fireflyiii/core:latest >/dev/null &&
docker image inspect fireflyiii/core:latest --format \"{{index .RepoDigests 0}}\" &&
docker pull postgres:17-alpine >/dev/null &&
docker image inspect postgres:17-alpine --format \"{{index .RepoDigests 0}}\""'
```

Reporter les deux digests dans le fichier de l'étape 3.

- [ ] **Étape 3 : écrire le fichier Compose**

Créer `homelab-config/docker/finance/docker-compose.yml` :

```yaml
services:
  app:
    # Digest releve le 2026-08-17 — mettre a jour via `docker pull` + `image inspect`
    image: fireflyiii/core:latest@sha256:REMPLACER_PAR_LE_DIGEST_RELEVE
    container_name: firefly
    restart: unless-stopped
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - firefly-upload:/var/www/html/storage/upload
    ports:
      # Lie a l'IP LAN du LXC : Traefik (sur penny) est le seul client.
      - "192.168.1.34:8080:8080"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "-o", "/dev/null", "http://localhost:8080/login"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 90s

  db:
    # Digest releve le 2026-08-17
    image: postgres:17-alpine@sha256:REMPLACER_PAR_LE_DIGEST_RELEVE
    container_name: firefly-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_DATABASE}
      POSTGRES_USER: ${DB_USERNAME}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - firefly-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USERNAME} -d ${DB_DATABASE}"]
      interval: 10s
      timeout: 5s
      retries: 10

volumes:
  firefly-db:
  firefly-upload:
```

- [ ] **Étape 4 : écrire `.env.example`**

Créer `homelab-config/docker/finance/.env.example` — **sans valeur réelle** :

```bash
# Firefly III — variables attendues. Le vrai .env vit dans le LXC 109,
# jamais dans git.
APP_KEY=            # exactement 32 caracteres alphanumeriques
APP_URL=https://finance.home.gabin-simond.fr
TZ=Europe/Paris
DEFAULT_LANGUAGE=fr_FR
DEFAULT_LOCALE=fr_FR
SITE_OWNER=gabin.simond@simondancebros.org

# Derriere Traefik : sans TRUSTED_PROXIES, Firefly III genere des URL en
# http:// et la connexion boucle indefiniment.
TRUSTED_PROXIES=**

DB_CONNECTION=pgsql
DB_HOST=db
DB_PORT=5432
DB_DATABASE=firefly
DB_USERNAME=firefly
DB_PASSWORD=

# Jeton du cron interne (32 caracteres), utilise par le timer de l'etape 8
STATIC_CRON_TOKEN=
```

- [ ] **Étape 5 : générer les secrets et déployer dans le LXC**

`APP_KEY` et `STATIC_CRON_TOKEN` font **exactement 32 caractères** ; une
autre longueur fait échouer le démarrage avec un message peu clair.

```bash
ssh galahad 'pct exec 109 -- bash -c "
mkdir -p /opt/finance &&
head -c 4096 /dev/urandom | LC_ALL=C tr -dc \"A-Za-z0-9\" | head -c 32 > /tmp/appkey &&
head -c 4096 /dev/urandom | LC_ALL=C tr -dc \"A-Za-z0-9\" | head -c 32 > /tmp/crontoken &&
head -c 4096 /dev/urandom | LC_ALL=C tr -dc \"A-Za-z0-9\" | head -c 40 > /tmp/dbpass &&
wc -c /tmp/appkey /tmp/crontoken"'
```

Attendu : `32` pour les deux premiers.

Copier les deux fichiers depuis penny, puis injecter les secrets.
**Ne jamais lancer ces commandes avec `bash -x`** : les identifiants
finiraient dans le journal.

```bash
# Depuis penny — pct push copie un fichier local vers le LXC
scp /mnt/ssd/homelab-config/docker/finance/docker-compose.yml galahad:/tmp/
scp /mnt/ssd/homelab-config/docker/finance/.env.example galahad:/tmp/
ssh galahad 'pct push 109 /tmp/docker-compose.yml /opt/finance/docker-compose.yml'
ssh galahad 'pct push 109 /tmp/.env.example /opt/finance/.env'
rm -f /tmp/docker-compose.yml /tmp/.env.example
ssh galahad 'rm -f /tmp/docker-compose.yml /tmp/.env.example'
```

Injecter les trois secrets générés à l'étape précédente :

```bash
ssh galahad 'pct exec 109 -- bash -c "
cd /opt/finance &&
sed -i \"s|^APP_KEY=.*|APP_KEY=\$(cat /tmp/appkey)|\" .env &&
sed -i \"s|^STATIC_CRON_TOKEN=.*|STATIC_CRON_TOKEN=\$(cat /tmp/crontoken)|\" .env &&
sed -i \"s|^DB_PASSWORD=.*|DB_PASSWORD=\$(cat /tmp/dbpass)|\" .env &&
shred -u /tmp/appkey /tmp/crontoken /tmp/dbpass &&
chmod 600 .env"'
```

Vérifier qu'aucune des trois variables n'est restée vide, **sans afficher
les valeurs** :

```bash
ssh galahad 'pct exec 109 -- bash -c "grep -cE \"^(APP_KEY|STATIC_CRON_TOKEN|DB_PASSWORD)=.+\" /opt/finance/.env"'
```

Attendu : `3`.

- [ ] **Étape 6 : démarrer et relancer la vérification**

```bash
ssh galahad 'pct exec 109 -- docker compose -f /opt/finance/docker-compose.yml up -d'
sleep 90
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.1.34:8080/login
```

Attendu : `200`.

En cas de `500`, lire les journaux :
`ssh galahad 'pct exec 109 -- docker logs firefly --tail 50'`. Les deux
causes fréquentes sont un `APP_KEY` de mauvaise longueur et un Postgres pas
encore prêt.

- [ ] **Étape 7 : écrire le timer du cron interne de Firefly III**

Firefly III a une tâche périodique propre — transactions récurrentes,
rappels de factures — déclenchée par un appel HTTP authentifié par le
`STATIC_CRON_TOKEN`. Sans elle, les récurrences ne se créent jamais, en
silence.

Créer `homelab-config/system/finance/firefly-cron.service` :

```ini
[Unit]
Description=Cron interne de Firefly III
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
EnvironmentFile=/opt/finance/.env
ExecStart=/usr/bin/curl -fsS -o /dev/null --max-time 30 \
  http://127.0.0.1:8080/api/v1/cron/${STATIC_CRON_TOKEN}
```

Créer `homelab-config/system/finance/firefly-cron.timer` :

```ini
[Unit]
Description=Cron interne de Firefly III, quotidien

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=600

[Install]
WantedBy=timers.target
```

- [ ] **Étape 8 : déployer le timer et vérifier qu'il aboutit**

Déposer les deux unités dans `/etc/systemd/system/` du LXC, puis :

```bash
ssh galahad 'pct exec 109 -- bash -c "systemctl daemon-reload && systemctl enable --now firefly-cron.timer && systemctl start firefly-cron.service"'
ssh galahad 'pct exec 109 -- systemctl show firefly-cron.service -p Result --value'
```

Attendu : `success`. Un `exit-code` signale un jeton erroné — vérifier que
`STATIC_CRON_TOKEN` fait bien 32 caractères.

- [ ] **Étape 9 : commiter**

```bash
cd /mnt/ssd/homelab-config
git add docker/finance/docker-compose.yml docker/finance/.env.example system/finance/firefly-cron.service system/finance/firefly-cron.timer
git commit -m "feat(finance): pile Firefly III + Postgres et cron interne"
```

---

## Tâche 4 : exposition HTTPS derrière Authelia

**Fichiers**
- Créer : `homelab-config/traefik/dynamic/finance.yml`
- Modifier : `docs/projet/2026-08-17-pilotage-financier-design.md` (section
  « Accès »)

**Interfaces**
- Consomme : Firefly III sur `192.168.1.34:8080` (tâche 3).
- Produit : `https://finance.home.gabin-simond.fr` protégé par Authelia.

**Correction du spec, à appliquer dans cette tâche.** Le spec prévoyait
d'exclure `/api` du middleware Authelia, parce que l'importer appelle cette
API. C'est inutile et moins sûr : **l'importer tournera dans le même LXC et
la même pile Compose** (phase 2), donc il joindra Firefly III par le réseau
Docker interne (`http://app:8080`) sans jamais passer par Traefik ni
Authelia. Exposer publiquement une route `/api` authentifiée par simple
jeton créerait une surface d'attaque pour rien.

**Décision : tout passe derrière Authelia, sans exception.** Si une
application mobile tierce est souhaitée plus tard, on ajoutera une route
`/api` restreinte par `IPAllowList` à la plage Tailscale — pas une route
publique.

- [ ] **Étape 1 : écrire la vérification et la voir échouer**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://finance.home.gabin-simond.fr/
```

Attendu : échec DNS ou 404 de Traefik.

- [ ] **Étape 2 : écrire le fichier de routage**

Créer `homelab-config/traefik/dynamic/finance.yml`, calqué sur
`traefik/dynamic/logs.yml` :

```yaml
http:
  routers:
    finance:
      rule: "Host(`finance.home.gabin-simond.fr`)"
      entryPoints:
        - websecure
      service: finance
      # Aucune exception : l'importer parle a Firefly III par le reseau
      # Docker interne, il n'a pas besoin de traverser Traefik.
      middlewares:
        - authelia@docker
        - security-headers@file
      tls:
        certResolver: letencrypt
  services:
    finance:
      loadBalancer:
        servers:
          - url: "http://192.168.1.34:8080"
```

- [ ] **Étape 3 : déployer et vérifier la résolution DNS**

Copier le fichier vers `/mnt/ssd/config/traefik/dynamic/` sur penny.
Traefik recharge son provider fichier tout seul, sans redémarrage.

```bash
dig +short finance.home.gabin-simond.fr
```

Attendu : une IP. AdGuard applique une réécriture joker sur
`*.home.gabin-simond.fr` — si rien ne sort, ajouter l'entrée à la main.

- [ ] **Étape 4 : relancer la vérification**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -L https://finance.home.gabin-simond.fr/
```

Attendu : `200` sur la page de connexion **d'Authelia**, pas de Firefly III.

Vérifier explicitement que la redirection vient bien d'Authelia :

```bash
curl -sSI https://finance.home.gabin-simond.fr/ | grep -i location
```

Attendu : une `Location:` pointant vers `auth.home.gabin-simond.fr`.

Un 302 seul ne prouve rien sur l'état du service derrière — c'est le
middleware qui répond. Pour vérifier que Firefly III est réellement debout,
utiliser la sonde directe de la tâche 3, étape 6.

- [ ] **Étape 5 : créer le compte et vérifier le certificat**

Se connecter via Authelia, créer le compte Firefly III (le premier compte
créé est administrateur), puis :

```bash
echo | openssl s_client -connect finance.home.gabin-simond.fr:443 -servername finance.home.gabin-simond.fr 2>/dev/null | openssl x509 -noout -dates -issuer
```

Attendu : un certificat Let's Encrypt valide, pas le certificat par défaut
de Traefik.

- [ ] **Étape 6 : mettre le spec à jour puis commiter**

Dans le spec, remplacer le paragraphe « L'API de Firefly III est exclue du
middleware `forwardAuth` » par la décision prise ci-dessus.

```bash
cd /mnt/ssd/homelab-config
git add traefik/dynamic/finance.yml
git commit -m "feat(finance): routage Traefik derriere Authelia, sans exception API"

cd /mnt/ssd/homelab-doc
git add docs/projet/2026-08-17-pilotage-financier-design.md
git commit -m "docs(projet): l'API Firefly III reste derriere Authelia (correction)"
```

---

## Tâche 5 : sauvegarde `pg_dump` + restic

**Fichiers**
- Créer : `homelab-config/scripts/finance-backup.sh`
- Créer : `homelab-config/system/finance/finance-backup.service`
- Créer : `homelab-config/system/finance/finance-backup.timer`

**Interfaces**
- Consomme : la base `firefly` (tâche 3), `/root/.restic-env` dans le LXC.
- Produit : un instantané restic quotidien dans le dépôt `restic-finance`.
  La tâche 6 le restaure.

- [ ] **Étape 1 : écrire la vérification et la voir échouer**

```bash
ssh galahad 'pct exec 109 -- bash -c "set -a; . /root/.restic-env; set +a; restic snapshots --json"'
```

Attendu : échec — `/root/.restic-env` absent, ou dépôt inexistant.

- [ ] **Étape 2 : déposer les identifiants et initialiser le dépôt**

Créer `/root/.restic-env` dans le LXC 109, sur ce modèle. Les valeurs de
`RESTIC_PASSWORD` et des identifiants R2 se reprennent depuis le
`/root/.restic-env` du LXC Vaultwarden (LXC 102) — **ne jamais les afficher
à l'écran ni les copier dans git**.

```bash
# /root/.restic-env — LXC 109 finance. chmod 600.
RESTIC_REPOSITORY=<meme prefixe R2 que les autres depots>/restic-finance
RESTIC_PASSWORD=<identique aux autres depots>
AWS_ACCESS_KEY_ID=<identifiant R2>
AWS_SECRET_ACCESS_KEY=<cle R2>
NTFY_URL=<voir ci-dessous>
```

Pour `NTFY_URL`, relever la valeur réellement en service plutôt que de la
supposer — la migration vers le ntfy auto-hébergé était en cours :

```bash
grep -rhoE 'https?://[^"'"'"' ]*ntfy[^"'"'"' ]*' /mnt/ssd/homelab-config/scripts/ | sort -u
```

Prendre la valeur qui sort. Si plusieurs apparaissent, la plus récemment
modifiée fait foi (`git log -1 --format=%ci -- <fichier>`).

```bash
ssh galahad 'pct exec 109 -- chmod 600 /root/.restic-env'
ssh galahad 'pct exec 109 -- bash -c "set -a; . /root/.restic-env; set +a; restic init"'
```

Attendu : `created restic repository ... `. Si le dépôt existe déjà, restic
le dit et c'est acceptable.

- [ ] **Étape 3 : écrire le script de sauvegarde**

Créer `homelab-config/scripts/finance-backup.sh`, calqué sur
`scripts/vault-lxc-backup.sh` :

```bash
#!/bin/bash
# ============================================================
# Finance LXC 109 — pg_dump + restic vers le depot restic-finance
# Declenche par finance-backup.timer (02:30, Persistent=true)
#
# Sauvegarde :
#   - /var/backups/finance/firefly.sql  (dump logique, coherent)
#   - le volume des pieces jointes
#
# Retention : 7 quotidiennes / 4 hebdomadaires / 6 mensuelles
# Notification : ntfy (low si OK, high si ECHEC)
# ============================================================

set -uo pipefail

export TMPDIR=/tmp
LOGFILE=/var/log/finance-backup.log
DUMPDIR=/var/backups/finance
NTFY="${NTFY_URL:?NTFY_URL absent de /root/.restic-env}"

log() { echo "[$(date +'%F %T')] $*" >> "$LOGFILE"; }

notify() {
    local title="$1" priority="$2" tags="$3" message="$4"
    curl -s -o /dev/null --max-time 10 \
        -H "Title: $title" -H "Priority: $priority" -H "Tags: $tags" \
        -d "$message" "$NTFY" 2>/dev/null || true
}

if [ ! -f /root/.restic-env ]; then
    log "FATAL: /root/.restic-env manquant"
    notify "Sauvegarde finance ECHEC" high rotating_light "/root/.restic-env manquant dans le LXC 109"
    exit 1
fi

set -a
# shellcheck source=/dev/null
. /root/.restic-env
set +a

mkdir -p "$DUMPDIR"
chmod 700 "$DUMPDIR"

log "=== Sauvegarde finance : demarrage ==="

# Dump logique : un instantane de volume ne garantit pas une base coherente.
if ! docker exec firefly-db pg_dump -U firefly -d firefly --clean --if-exists \
        > "$DUMPDIR/firefly.sql" 2>>"$LOGFILE"; then
    log "FATAL: pg_dump a echoue"
    notify "Sauvegarde finance ECHEC" high rotating_light "pg_dump a echoue sur le LXC 109"
    exit 1
fi

# Un dump vide est un echec silencieux : on le refuse explicitement.
DUMP_SIZE=$(stat -c%s "$DUMPDIR/firefly.sql")
if [ "$DUMP_SIZE" -lt 10240 ]; then
    log "FATAL: dump suspect ($DUMP_SIZE octets)"
    notify "Sauvegarde finance ECHEC" high rotating_light "Dump de seulement $DUMP_SIZE octets — base vide ou corrompue ?"
    exit 1
fi

if restic backup "$DUMPDIR" --tag daily --tag finance >>"$LOGFILE" 2>&1; then
    restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 \
        --prune >>"$LOGFILE" 2>&1
    log "OK — dump de $DUMP_SIZE octets sauvegarde"
    notify "Sauvegarde finance OK" low white_check_mark "Dump de $((DUMP_SIZE/1024)) Kio envoye vers restic-finance"
else
    log "FATAL: restic backup a echoue"
    notify "Sauvegarde finance ECHEC" high rotating_light "restic backup a echoue sur le LXC 109"
    exit 1
fi
```

- [ ] **Étape 4 : écrire l'unité et le timer**

`homelab-config/system/finance/finance-backup.service` :

```ini
[Unit]
Description=Sauvegarde Firefly III (pg_dump + restic)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/root/finance-backup.sh
```

`homelab-config/system/finance/finance-backup.timer` :

```ini
[Unit]
Description=Sauvegarde Firefly III quotidienne

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

`Persistent=true` rattrape l'exécution manquée si le LXC était arrêté à
02:30 — sans lui, la sauvegarde saute en silence.

- [ ] **Étape 5 : déployer et lancer une fois à la main**

```bash
ssh galahad 'pct exec 109 -- bash -c "chmod 700 /root/finance-backup.sh && systemctl daemon-reload && systemctl enable --now finance-backup.timer"'
ssh galahad 'pct exec 109 -- systemctl start finance-backup.service'
ssh galahad 'pct exec 109 -- journalctl -u finance-backup.service -n 20 --no-pager'
```

- [ ] **Étape 6 : relancer la vérification**

```bash
ssh galahad 'pct exec 109 -- bash -c "set -a; . /root/.restic-env; set +a; restic snapshots --json"' | head -c 400
ssh galahad 'pct exec 109 -- systemctl list-timers finance-backup.timer --no-pager'
```

Attendu : au moins un instantané, et un timer avec une prochaine échéance.

- [ ] **Étape 7 : commiter**

```bash
cd /mnt/ssd/homelab-config
git add scripts/finance-backup.sh system/finance/
git commit -m "feat(finance): sauvegarde quotidienne pg_dump + restic"
```

---

## Tâche 6 : prouver la restauration, et brancher PBS

**Fichiers**
- Modifier : `docs/projet/2026-08-17-pilotage-financier-phase1-plan.md`
  (consigner le résultat du drill)

**Interfaces**
- Consomme : l'instantané restic de la tâche 5.
- Produit : la preuve que la sauvegarde est restaurable. Sans cette tâche,
  la phase 1 n'est pas terminée.

Une sauvegarde jamais restaurée n'est pas une sauvegarde. Cette tâche existe
parce que le dépôt principal a passé 251 h en panne silencieuse en août.

- [ ] **Étape 1 : écrire la vérification et la voir échouer**

```bash
ssh galahad 'pct exec 109 -- docker exec firefly-db psql -U firefly -d firefly_restore_test -c "\dt"'
```

Attendu : échec, la base `firefly_restore_test` n'existe pas.

- [ ] **Étape 2 : restaurer l'instantané dans une base jetable**

```bash
ssh galahad 'pct exec 109 -- bash -c "
set -a; . /root/.restic-env; set +a
restic restore latest --target /tmp/restore-test
ls -la /tmp/restore-test/var/backups/finance/"'
```

Attendu : `firefly.sql` présent, taille non nulle.

```bash
ssh galahad 'pct exec 109 -- bash -c "
docker exec firefly-db createdb -U firefly firefly_restore_test &&
docker exec -i firefly-db psql -U firefly -d firefly_restore_test < /tmp/restore-test/var/backups/finance/firefly.sql"'
```

- [ ] **Étape 3 : relancer la vérification**

```bash
ssh galahad 'pct exec 109 -- docker exec firefly-db psql -U firefly -d firefly_restore_test -c "\dt" | head -20'
ssh galahad 'pct exec 109 -- docker exec firefly-db psql -U firefly -d firefly_restore_test -tAc "select count(*) from users"'
```

Attendu : la liste des tables de Firefly III, et **au moins 1** utilisateur.
Un `0` signifie que le dump est syntaxiquement valide mais vide — c'est
précisément le mode d'échec que l'on cherche à exclure.

- [ ] **Étape 4 : nettoyer**

```bash
ssh galahad 'pct exec 109 -- bash -c "docker exec firefly-db dropdb -U firefly firefly_restore_test && rm -rf /tmp/restore-test"'
```

- [ ] **Étape 5 : ajouter le LXC au job PBS**

Relever d'abord le nom exact du stockage PBS et le job existant :

```bash
ssh galahad 'pvesm status --content backup'
ssh galahad 'cat /etc/pve/jobs.cfg'
```

Ajouter `109` à la liste `vmid` du job vzdump existant, puis déclencher une
sauvegarde en reprenant le nom de stockage relevé ci-dessus :

```bash
ssh galahad 'vzdump 109 --mode snapshot --storage <nom releve par pvesm status>'
```

Attendu : `INFO: Finished Backup of VM 109`. Attention au piège connu du
`pct.conf` en LXC non privilégié — si l'erreur « permission denied »
apparaît, le hook de contournement existant s'applique.

- [ ] **Étape 6 : consigner le drill et commiter**

Ajouter au tableau ci-dessous la date du drill et le nombre de tables
restaurées.

| Drill | Date | Résultat |
|---|---|---|
| Restauration `restic-finance` | | |

```bash
cd /mnt/ssd/homelab-doc
git add docs/projet/2026-08-17-pilotage-financier-phase1-plan.md
git commit -m "docs(projet): drill de restauration finance valide"
```

---

## Définition de terminé, pour la phase 1

- [ ] `https://finance.home.gabin-simond.fr` répond, derrière Authelia
- [ ] Le certificat est émis par Let's Encrypt
- [ ] Une saisie manuelle de transaction est possible et persiste après
      `docker compose restart`
- [ ] Un instantané restic existe et **a été restauré avec succès**
- [ ] Le timer de sauvegarde est actif, avec `Persistent=true`
- [ ] Le LXC est dans le job PBS
- [ ] Aucun secret n'est présent dans git (`git log -p` sur les commits de
      cette phase, ou le hook de pré-commit du dépôt)

## Ce que la phase 1 ne fait pas

Import bancaire, règles de catégorisation, crédits, dashboards Grafana,
alertes de fraîcheur. Ils arrivent en phases 2 à 4, chacune avec ses propres
garde-fous.
