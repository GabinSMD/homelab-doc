# DR Drill Scénario 1 — Restore complet depuis B2

**Objectif** : valider qu'un restore depuis Backblaze B2 sur une machine vierge redonne un homelab fonctionnel.

**Fréquence recommandée** : trimestrielle, ou après changement majeur (kernel, Docker, sops config).

**Materiel** :
- Raspberry Pi 4 (ou VM arm64) vierge, carte SD DietPi neuve
- YubiKey OU acces au vault contenant la sauvegarde de la clé age
- Connexion internet (~130 Mo de paquets apt + plusieurs Go B2)

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

### Phase 3 — Restore depuis B2 (30 min)
- [ ] Récupérer le restic repo URL + password depuis le vault
- [ ] Export env :
      ```
      export RESTIC_REPOSITORY=b2:homelab-penny:/
      export RESTIC_PASSWORD=...
      export B2_ACCOUNT_ID=...
      export B2_ACCOUNT_KEY=...
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
**Scénario 3** (futur) : B2 inaccessible, restore depuis dump local NFS/PBS.

## Critères de succès

- Temps total < 2h
- Zero intervention manuelle sur un fichier de config (tout vient du restore)
- 100% des services critiques up (Traefik, Authelia, AdGuard, Homepage)

## Critères d'échec = action requise

- Un secret manquant dans le restore -> mettre a jour le chemin dans `homelab_backup.sh`
- Une clé age non retrouvable -> rotation + redeploiement vers YubiKey ET vault
- Un container qui ne démarre pas -> bug compose, fixer AVANT la prochaine drill
