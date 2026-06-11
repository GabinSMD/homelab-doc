# DR Drill Scénario 1 — Restore complet depuis Cloudflare R2

**Objectif** : valider qu'un restore depuis Cloudflare R2 sur une machine vierge redonne un homelab fonctionnel.

**Fréquence recommandée** : trimestrielle, ou après changement majeur (kernel, Docker, sops config).

!!! info "Validation automatique entre deux drills complets"
    Le restore complet ci-dessous est un exercice manuel lourd (~90 min, matériel vierge).
    Entre deux exécutions, la chaîne de restore R2 est validée **automatiquement chaque
    mois** par deux systemd timers `Persistent=true` sur penny (le 1er du mois ; un run
    manqué pendant un downtime s'exécute au boot suivant — migration cron → timers
    2026-06-11 après le drill du 01/06 sauté silencieusement pendant le downtime penny) :

    - `restic-check-monthly` (04:00) — `restic check` structure + `--read-data-subset=10%`
      sur les 4 repos. Sur 10 mois, couvre ~100% des données (bit rot detection).
    - `restic-drill-monthly` (05:00) — restore d'un fichier réel du dernier snapshot de
      chaque repo restic + **pbs-datastore** (`rclone check` one-way R2→local + restore
      témoin md5). Détecte une corruption qui passerait `check`.

    Échec → alerte ntfy haute priorité. Dernière validation : **2026-06-11**, drill complet
    via systemd, 4/4 repos restic + pbs-datastore OK (4784 fichiers matchés, 665s ;
    spec : [fiabilisation drill](../projet/2026-06-11-fiabilisation-drill-restauration.md)).

**Materiel** :
- Raspberry Pi 4 (ou VM arm64) vierge, carte SD DietPi neuve
- YubiKey OU acces au vault contenant la sauvegarde de la clé age
- Connexion internet (~130 Mo de paquets apt + plusieurs Go R2)

---

## Checklist (~90 min)

### Phase 1 — Base system (15 min)
- [ ] Installation fraiche DietPi bookworm
- [ ] Premier login SSH, user root
- [ ] `apt update && apt install -y sops age git restic jq curl`
- [ ] Installer Docker via `get.docker.com`
- [ ] Installer Tailscale (pas indispensable mais confortable)

### Phase 2 — Restore de la clé age (5 min)
La clé age est la racine de confiance. Sans elle, rien ne déchiffré.
- [ ] Récupérer la clé depuis YubiKey (PIV slot 9c) OU depuis vault.home
- [ ] La placer dans `/root/.config/sops/age/keys.txt` (chmod 600)
- [ ] `sops --version` pour vérifier que sops trouve la clé :
      `SOPS_AGE_KEY_FILE=/root/.config/sops/age/keys.txt sops -d /tmp/test.enc`

### Phase 3 — Restore depuis Cloudflare R2 (30 min)
- [ ] Récupérer le restic repo URL + password depuis le vault (sealed `system/secrets/restic-env.enc`)
- [ ] Export env :
      ```
      export RESTIC_REPOSITORY=s3:https://<account-id>.eu.r2.cloudflarestorage.com/homelab-backups/restic
      export RESTIC_PASSWORD=...
      export AWS_ACCESS_KEY_ID=...        # R2 API token "Access Key ID"
      export AWS_SECRET_ACCESS_KEY=...    # R2 API token "Secret Access Key"
      ```
- [ ] `restic snapshots` — vérifier qu'on voit les snapshots
- [ ] Choisir le snapshot le plus recent
- [ ] `restic restore latest --target /` (attention, ecrase !)
- [ ] Vérifier : `/mnt/ssd/config/` + `/root/*.sh` + `/etc/systemd/system/homelab-*`

### Phase 4 — Bring up (20 min)
- [ ] `systemctl daemon-reload`
- [ ] `systemctl enable --now homelab-unseal.service`
- [ ] Vérifier : `ls /run/homelab/` doit contenir `.env`, `authelia-secrets/`, `crowdsec/`
- [ ] `cd /mnt/ssd/config/docker && docker compose up -d`
- [ ] Attendre 2 min, `docker ps` — tous healthy sauf loki-replica (no healthcheck)

### Phase 5 — Smoke tests (15 min)
- [ ] `curl -k https://traefik.home.gabin-simond.fr` — Traefik répond
- [ ] Login Homepage via Authelia — OIDC fonctionne
- [ ] AdGuard accessible, resolve test
- [ ] Beszel montre les metriques
- [ ] Portainer liste les containers
- [ ] `/root/homelab_monitor.sh` — aucune alerte

### Phase 6 — Cleanup (5 min)
- [ ] `docker compose down` sur la machine de drill
- [ ] Noter la durée totale + anomalies dans memory/project_dr_drills.md
- [ ] Si test réussi : tag `dr-drill-YYYYMMDD` sur le commit restic qui a servi

---

## Variantes

**Scénario 2** (futur) : perte de la clé age primaire, restore via yubikey-only.
**Scénario 3** (futur) : R2 inaccessible (panne Cloudflare, creds révoqués), restore depuis
la copie PBS la plus récente (LXC 103) ou un dump local.

!!! note "B2 décommissionné le 2026-05-29"
    L'ancien backend Backblaze B2 a été supprimé après migration vers R2 (mai 2026).
    R2 est désormais l'unique backend cloud. Le PBS reste le second chemin de restore
    (full-LXC, indépendant de R2).

## Critères de succès

- Temps total < 2h
- Zero intervention manuelle sur un fichier de config (tout vient du restore)
- 100% des services critiques up (Traefik, Authelia, AdGuard, Homepage)

## Critères d'échec = action requise

- Un secret manquant dans le restore -> mettre a jour le chemin dans `homelab_backup.sh`
- Une clé age non retrouvable -> rotation + redeploiement vers YubiKey ET vault
- Un container qui ne démarre pas -> bug compose, fixer AVANT la prochaine drill
