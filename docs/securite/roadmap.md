# Roadmap sécurité

État au **2026-05-05** (refresh complet post-Phase 2 egress firewall). Priorité : `impact / effort`.

> Pour la doctrine (threat model, politique credentials) : [politique.md](politique.md).
> Pour les implémentations (sysctl, firewall, SSH) : [hardening.md](hardening.md).
> Pour le contexte projet global : [projet/roadmap.md](../projet/roadmap.md).

---

## En cours / a faire

### P1 — Important (action user-side requise)

#### TFA root@pam Proxmox — finding MEDIUM ouvert depuis audit 2026-04-19

`/etc/pve/priv/tfa.cfg` = `{}` sur galahad+lancelot.

**Fix** (5 min UI manuel) : Datacenter → Permissions → Two Factor → Add → TOTP → root@pam → scan QR avec authenticator app (Authy/Bitwarden/1Password).

Pas scriptable proprement côté Proxmox.

#### DR drill from cold — jamais teste

Tu as :
- 22 daily snapshots B2 ✓
- restic check + drill mensuels ✓
- Sops + age + 2 YubiKeys DR ✓

**Mais jamais reconstruit penny depuis zero**. Le drill mensuel vérifie intégrité données, pas full restore. Scénario reel : SSD meurt → Pi neuf → restore B2 + sops → est-ce que ca reboot dans un état exploitable en X heures ?

**Effort** : 1/2 journee. Pi 4 spare ou VM x86. Suivre [break-glass](../operations/break-glass.md) + [dr-drill-scénario-1](../operations/dr-drill-scenario-1.md), chronometrer, noter les surprises.

---

### P2 — Avant demenagement / OPNsense

#### VLANs + OPNsense

Bloque par achat hardware. Voir [architecture/réseau-cible.md](../architecture/reseau-cible.md).

#### Chiffrement au repos (ZFS) — SKIP DOCUMENTÉ

Voir [decisions.md](../projet/decisions.md). Skip pour homelab domicile (modèle de menace ne le justifie pas ; casse boot unattended). A reconsiderer si demenagement avec serveurs en transit ou stockage données client/médical.

#### Egress firewall (penny + galahad + lancelot) — DONE 2026-05-05

**Phase 1** (`egress-audit.sh`, audit LOG only) : déployée 2026-04-14 sur penny, étendue 2026-04-19 sur galahad+lancelot. Collecte ~3 semaines.

**Phase 2** (`egress-phase2.sh`, OUTPUT DROP + whitelist port-based) : déployée 2026-05-05 sur les 3 hosts.

Whitelist :
- Skip lo + 192.168.1.0/24 + 100.64.0.0/10 (Tailscale) + 172.16.0.0/12 (Docker bridges) + ESTABLISHED/RELATED
- ICMP, DNS (53/853), NTP (123), HTTP (80), HTTPS (443), Tailscale STUN (3478) + P2P (41641)
- PVE nodes (galahad+lancelot) : SMTP (25 + 587) pour postfix outbound mail

Validation 30 min sur chaque host : DROP counter = 6 packets sur 30 min, **100% SSDP UPnP multicast** (`239.255.255.250:1900`, TTL=1, bénin LAN-only).

Rollback safety : `apply` arme un timer systemd `egress-phase2-rollback` 5 min ; si `confirm` n'est pas lance avant, restore auto des iptables pre-Phase 2. Backup dans `/tmp/iptables-pre-egress-phase2.rules`.

Persistance reboot : `iptables-persistent` package + `iptables-save > /etc/iptables/rules.v4` + `netfilter-persistent.service enabled`.

Script tracke dans `homelab-config/scripts/egress-phase2.sh`.

#### Healthchecks Beszel + Portainer + beszel-agent — NON APPLICABLE

Les 3 images sont scratch/distroless (Go static binary) : **aucun** outil CLI (wget, curl, sh) n'est disponible dans le container. Pas de subcommand healthcheck non plus. Healthchecks impossibles sans rebuilder les images.

**Mitigation** : monitoring via `homelab_monitor.sh` (check Docker containers stopped/unhealthy) + Beszel agent metriques.

#### PVE firewall logging — DONE 2026-04-19

`/etc/pve/firewall/cluster.fw` : toutes les rules ont `-log warning` (déployé 2026-04-19 dans le commit hardening systemd mount leaks). Audit visibility OK sur tentatives bloquees.

#### YubiKey sur clés SSH client — DONE

`sk-ssh-ed25519@openssh.com` keys présentés dans `/home/gabins/.ssh/authorized_keys` sur penny + galahad + lancelot, et `/root/.ssh/authorized_keys` sur penny. Clés touch-required pour sudo.

#### Mot de passe GRUB (galahad + lancelot) — DEFERE

Suggestion Lynis BOOT-5122. **Defere** : risque lock boot remote (si patch /etc/grub.d/10_linux loupe, aucune entry boot sans password) >> gain marginal (attaquant avec acces physique peut déjà booter USB). User-side seulement.

---

### P3 — Nice to have / hardening avance

#### Process / supply chain

- **Renovate ou Dependabot** sur homelab-config repo (auto-PR pour deps Python fish + scripts). Aujourd'hui `uv.lock` jamais bumpe = risk CVE silencieux dans `anthropic`/`PyGithub`/`aiohttp`. Effort : 30 min config GitHub Actions.
- **CI/CD GitHub Actions** sur homelab-config (pytest fish + ruff + bash -n + secret scan avant merge). Today direct push main = no quality gate. Effort : 1h.
- **Trivy schedule** — vuln scanning images Docker hebdo, push results dans Loki ou ntfy si CRITIQUE. Effort : 30 min.

#### Network / détection

- HIDS (Wazuh / CrowdSec extension fonctionne déjà sur Trixie).
- IDS réseau (Suricata / Zeek) — a considerer une fois OPNsense stable.
- AIDE/Tripwire — file integrity monitoring `/etc /usr`. Vrai paranoia level. Effort : 1h baseline + cron diff.
- Bastion SSH LXC — Tailscale SSH couvre déjà 80%, faible valeur ajoutee.

#### Hardening cosmetiques

- Symlink `/vmlinuz` (Lynis KRNL-5788, cosmetique). Done partiellement : penny — a propager galahad+lancelot.
- SMTP migration port 25 → 587 auth submission (PVE postfix) — supprimé risk spam relay si compromission. Effort : 1h + setup credentials relay (Mailgun gratuit ou similaire).
- ~~Renommer Tailscale hosts `pve1`/`pve2` → `galahad`/`lancelot`~~ DONE.

### P4 — Defere / decision documentée

- **Mot de passe GRUB** (galahad + lancelot) — Lynis BOOT-5122. Defere : risque lock boot remote >> gain (attaquant avec acces physique peut déjà booter USB).
- **Chiffrement disque ZFS** — SKIP documenté, voir P2 ci-dessus.

---

## Déjà fait

??? success "Observabilite / documentation"
    - Threat model documenté ([politique.md](politique.md))
    - Politique rotation / revocation documentée
    - Procédure revocation Tailscale ([réseau.md](../architecture/reseau.md))
    - Break-glass procédure ([break-glass.md](../operations/break-glass.md))
    - DR drill Vaultwarden (RTO 7s)
    - Scope token Cloudflare vérifie (1 zone)

??? success "Backups"
    - **Proxmox Backup Server** (LXC 103 "pbs" sur lancelot, IP 192.168.1.33) — backup natif de tous les LXC (100, 101, 102, 103) via API PBS
    - Datastore "main" sur NFS penny (`/mnt/ssd/pbs-datastore`, 65536 chunk dirs)
    - NFS export `all_squash anonuid=100034` (UID mappe LXC unprivileged)
    - Traefik route `backup.home.gabin-simond.fr` → PBS UI
    - Authelia OIDC realm "authelia" pour login PBS + comptes break-glass locaux
    - vzdump-permfix-hook.sh sur galahad + lancelot (workaround pct.conf permissions, TEMPORAIRE — a supprimer après migration ZFS)
    - **Vaultwarden restic-direct** (LXC 102 → B2:restic-vault, SQLite atomic snapshot, cron 02h, indépendant de PBS)
    - Off-site B2 chiffré (restic AES-256) pour penny configs + volumes Docker
    - Restic unique backend B2 natif (`b2:gabin-homelab-backups:restic`)
    - Volumes Docker stages sur `/mnt/ssd/.restic-staging` puis backup restic
    - Retention 7d/4w/6m + prune automatique
    - **restic check mensuel** (1er du mois 4h, structure + 10% data subset)
    - RPO uniforme 24h sur tout le homelab (Vaultwarden inclus)

??? success "Authentification"
    - Authelia 2FA (TOTP + WebAuthn FIDO2 YubiKey)
    - **Authelia regulation anti brute-force** (5 retries / 2min / ban 10min) — 2026-04-14
    - Consent mode `pre-configured` (1 an) sur tous les clients OIDC
    - SSH clés uniquement, ports custom, MaxAuthTries 3
    - **SSH hardening LXC** (100, 101, 102, 103) : `PermitRootLogin no`, `PasswordAuthentication no` — 2026-04-16
    - **penny SSH** : `PermitRootLogin no`, `PasswordAuthentication no` (dietpi.conf override) — 2026-04-16
    - **galahad/lancelot SSH** : `PermitRootLogin prohibit-password` (exception cluster Proxmox) — 2026-04-16
    - Comptes `gabins` partout, plus de `gabin` legacy
    - Sudo NOPASSWD (clé SSH = auth forte)
    - SSH hardening Lynis (`AllowTcpForwarding no`, etc.)
    - **Login.defs hardened** (UMASK 027, ENCRYPT_METHOD YESCRYPT, SHA_CRYPT_MIN_ROUNDS 65536, PASS_MIN/MAX/WARN) sur penny+galahad+lancelot
    - **PAM password strength** (libpam-passwdqc), libpam-tmpdir, needrestart, apt-listbugs sur 3 hosts

??? success "OIDC SSO (Authelia)"
    - Proxmox galahad + lancelot (Administrator sur gabins@authelia)
    - **PBS** (LXC 103, `gabins@authelia` Admin sur /, two_factor, pre-configured consent 1y) — 2026-04-16
    - Portainer
    - Beszel
    - Grafana (GrafanaAdmin, admin legacy désactivé)
    - **Rotation 2026-04-13** des 4 client_secret + AdGuard bcrypt — plains stockes Vaultwarden

??? success "ForwardAuth Authelia (services sans OIDC natif)"
    - Traefik dashboard
    - Homepage (etait sans auth)
    - AdGuard primaire (etait bcrypt seul)
    - AdGuard secondaire dns-failover (route dns-failover.home.*)
    - **WUD** (etait exposé anonyme — remplacé par Watchtower headless 2026-04-14)

??? success "Authelia session config explicite"
    - `expiration: 4h`
    - `inactivity: 30m`
    - `remember_me: 1M`

??? success "Traefik TLS hardening"
    - minVersion TLS 1.2 (TLS 1.3 default actif)
    - Cipher suites Mozilla intermediate (ChaCha20+AES-GCM ECDHE only)
    - Curves X25519/P256/P384
    - sniStrict (rejette SNI non-route)

??? success "Réseau"
    - Firewall iptables penny (INPUT DROP)
    - Firewall Proxmox cluster (galahad + lancelot)
    - **Firewall iptables LXC** (vault, logs, dns-failover, pbs) — INPUT DROP + whitelist par rôle
    - **NFS rules** (ports 2049, 111) pour LAN + Tailscale sur penny — 2026-04-16
    - Suppression règles temporaires vault-import (port 8765) — 2026-04-16
    - sysctl hardening (rp_filter, SYN flood, source route, martians)
    - **kernel.kptr_restrict=2 + kernel.yama.ptrace_scope=2** (galahad+lancelot ; YAMA n/a kernel RPi)
    - Rate limit Traefik Authelia (100 req/s SPA)
    - **`insecureSkipVerify` scope Proxmox only** (serversTransport dedie, retire du global Traefik) — 2026-04-14
    - DNSSEC validation (AdGuard primaire + dns-failover)
    - CAA records Cloudflare
    - Security headers HTTPS (HSTS, X-Frame, Referrer, Permissions-Policy)
    - **Topic ntfy randomise** (hex 32 chars, plus de topic prévisible) — 2026-04-14

??? success "Containers"
    - docker-socket-proxy + réseau `socket` isolé
    - `cap_drop: ALL` sur Authelia, Traefik, Homepage, Watchtower, Beszel
    - `no-new-privileges: true` global
    - ICC disabled sur bridge par defaut
    - Plus aucun port direct exposé (tout via Traefik HTTPS)
    - **`read_only: true` + tmpfs** sur Traefik, Homepage, Beszel, Watchtower
    - **Pinning digests `@sha256:...`** sur Vaultwarden, Authelia, Traefik (supply chain)
    - **Cosign installe** (apt Trixie) — vérifie : aucune des 3 images critiques n'est signed upstream, attendre évolution
    - Healthchecks Beszel + Portainer + beszel-agent : non applicable (images scratch/distroless, aucun outil CLI disponible)

??? success "Systemd-units hardening"
    - fail2ban : exposure 9.6 -> 4.7 (OK 🙂) sur penny+galahad+lancelot
    - ssh : exposure 9.6 -> 8.1 sur penny+galahad+lancelot
    - lynis : exposure 9.6 -> ~5
    - Docker/cron/getty : non hardened (besoin privileges, casserait service)

??? success "Audit / détection"
    - Lynis + cron hebdo + ntfy (penny 76, galahad 68, lancelot 69)
    - **auditd actif sur penny + galahad + lancelot** (auth, sudo, SSH, crontabs, firewall, Docker socket sur hosts Docker)
    - fail2ban (penny + galahad)
    - unattended-upgrades (penny + galahad)
    - rpcbind désactivé (galahad + lancelot) ; activé sur penny pour NFS (PBS datastore)

??? success "Observabilite"
    - Loki + Grafana Alloy sur LXC `logs`
    - Grafana renomme `logs.home.gabin-simond.fr`
    - Dashboards : **Homelab Overview** (nouveau), Auth & Sécurité (ameliore), Traefik Access (ameliore), Logs Explorer
    - **Alerting rules** (Authelia auth failures, fail2ban bans, Traefik 5xx, auditd sudo) -> ntfy
    - **Topic ntfy corrige** dans repo git + Grafana contact point (2026-04-14)
    - Retention 30 jours

??? success "Surveillance / résilience"
    - Watchdog hardware BCM2835 (penny)
    - Autoheal (restart containers unhealthy)
    - Auto-recovery SSD (device rename détection)
    - dns-failover LXC (health check externe penny depuis galahad)
    - DNS redondant primaire/secondaire
    - **AdGuard wildcard** `*.home.gabin-simond.fr` → penny (Traefik reverse proxy) — 2026-04-16
    - **adguard-sync.sh** : synchronisation primary → secondary (avec vérification canary) — 2026-04-16
    - **homelab_monitor.sh** : checks `check_adguard_sync`, `check_backup_freshness`, `check_vault_backup_freshness` — 2026-04-16
    - **Cluster quorum via qdevice sur penny** — 3 votes, survit perte 1 node — 2026-04-19
    - **Auto-repair docker** (`check_docker_autorepair`) — `docker compose up -d` automatique si stack vide + daemon UP > 2 min, circuit breaker 3/24h — 2026-04-19
    - **Cascade alert suppression** — `house-down` / `lancelot-down` suppriment les alertes enfants redondantes — 2026-04-19
    - **check_cluster_hosts** + **check_house** (Freebox + internet reach) — cause-racine avant symptomes — 2026-04-19
    - **check_restic_repos_freshness** — surveillé 4 repos B2 avec seuils par repo — 2026-04-19

??? success "Supply chain code"
    - Pre-commit hook anti-leak (`scripts/pre-commit-secret-scan.sh`) sur homelab-config + homelab-doc
    - Patterns : AWS, GitHub, Tailscale, B2, CF, PEM, password=, secret=
    - **12/13 images Docker pinnees @sha256** (loki-replica ajoute 2026-04-19, reste 1 non-pinnee decelee)

??? success "Secrets management"
    - **Authelia secrets externalises** (jwt, session, encryption_key, hmac → fichiers `/config/secrets/` chmod 600, charges via `AUTHELIA_*_FILE` env vars) — 2026-04-14
    - Clé JWKS OIDC dans `oidc.pem` séparée (gitignored)
    - Configuration Authelia versionnable sans secrets inline
    - **Sops + age scellement in-place** des secrets authelia+crowdsec credentials — 2026-04-19
    - Unseal au boot via `homelab-unseal.service` → tmpfs `/run/homelab/` → bind-mount Docker
    - Age private key backupee sur B2 (`/root/.config/sops/age` dans `homelab_backup.sh` paths) — 2026-04-19

??? success "Hardening systemd mount leaks"
    - Drop-ins `PrivateMounts=yes` sur 10 services penny (ssh, fail2ban, networkd, timesyncd, auditd, fstrim, hostnamed, localed, logind, timedated) — 2026-04-17/19
    - Idem 6 services sur galahad + lancelot (ssh, fail2ban, postfix, chrony, beszel-agent, logind) — 2026-04-19
    - Fix la cascade `/etc /usr /boot` RO au niveau namespace host via ProtectSystem=strict/full shared mount propagation
    - PVE firewall cluster.fw : `-log nolog` → `-log warning` sur galahad+lancelot — 2026-04-19

??? success "Observabilite HA"
    - **Alloy dual-write Loki** : primary (LXC 101 lancelot:3100) + replica (container loki-replica penny:3101) depuis les 3 hosts — 2026-04-19 étendu aux PVE nodes
    - Survit perte lancelot : replica continue sur penny
    - WAL Alloy rejoue si un sink down = zero perte

??? success "Backup tiers indépendants PBS"
    - 4 chaines restic-direct vers B2 : `restic` (penny daily), `restic-vault` (LXC 102 hourly), `restic-dnsfailover` (LXC 100 daily, 2026-04-19), `restic-logs` (LXC 101 daily, 2026-04-19)
    - `restic-check-monthly.sh` multi-repo : structure + 10% data subset sur les 4 repos — 2026-04-19
    - Freshness monitor par repo avec seuils dedies (vault 3h hourly, autres 30h daily)

??? success "Convention comptes et service accounts"
    - [comptes.md](comptes.md) : 3 tiers (root break-glass, gabins admin 2FA, svc-* automation)
    - Naming convention, arbre de decision, stockage Vaultwarden — 2026-04-16
    - Matrice par type de système (machines, PVE, PBS, Authelia, Docker, LXC, services web)

??? success "Migrations terminees"
    - Vaultwarden : penny Docker → LXC 102 `vault` sur galahad (isolé de logs sur lancelot, 2026-04-13)
    - Volume Docker orphelin `config_vaultwarden-data` supprimé de penny (2026-04-14)
    - Proxmox cluster : pve1/pve2 -> galahad/lancelot
    - **Galahad + lancelot déjà sur Trixie (Debian 13 / PVE 9.1.7 / kernel 6.17.2-1-pve)** — uniformite cluster
    - Tailscale : container -> host natif (SSH natif)
    - Wallos : supprimé
