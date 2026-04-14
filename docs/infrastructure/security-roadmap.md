# Roadmap securite

Etat au **2026-04-14**. Priorite : `impact / effort`.

> Pour la doctrine (threat model, politique credentials) : [security.md](security.md).
> Pour les implementations (sysctl, firewall, SSH) : [hardening.md](hardening.md).

---

## En cours / a faire

### P1 — Important

**Plus aucun item bloquant en P1**. La migration galahad -> Trixie etait deja faite (constat 2026-04-13). Les Lynis quick wins (login.defs + apt installs PAM) ont ete appliques 2026-04-13.

---

### P2 — Avant demenagement / OPNsense

#### VLANs + OPNsense

Bloque par achat hardware. Voir [network/architecture-cible.md](../network/architecture-cible.md).

#### Chiffrement au repos (ZFS) — SKIP DOCUMENTE

Voir [decisions.md](../decisions.md). Skip pour homelab domicile (modele de menace ne le justifie pas ; casse boot unattended). A reconsiderer si demenagement avec serveurs en transit ou stockage donnees client/medical.

#### Egress firewall (penny + galahad + lancelot)

Aujourd'hui `OUTPUT ACCEPT` partout : un container ou process compromis peut exfiltrer vers nimporte quelle destination internet.

**Action** : whitelist outbound (DNS Cloudflare, GitHub.com pour pulls, Backblaze B2, ntfy.sh, Tailscale relays DERP, Let's Encrypt CA pour Traefik renew, Authelia federations).

**Risque** : casser silencieusement Let's Encrypt renew, B2 backup, ntfy alerts si whitelist incomplete. Tester en mode `LOG` puis `DROP`.

**Effort** : 2-3h dont 1h validation post-deploy.

#### Healthchecks Beszel + Portainer + beszel-agent — NON APPLICABLE

Les 3 images sont scratch/distroless (Go static binary) : **aucun** outil CLI (wget, curl, sh) n'est disponible dans le container. Pas de subcommand healthcheck non plus. Healthchecks impossibles sans rebuilder les images.

**Mitigation** : monitoring via `homelab_monitor.sh` (check Docker containers stopped/unhealthy) + Beszel agent metriques.

#### WUD authentification interne — RESOLU 2026-04-14

WUD remplace par Watchtower (headless, aucune API/UI). Surface d'attaque interne supprimee.
Watchtower auto-update les services non-critiques, notifie via ntfy pour les critiques (`monitor-only` label).

#### PVE firewall logging

Cluster.fw : `-log nolog` partout -> aucune visibilite sur tentatives bloquees. Mettre `-log warning` ou `info` pour audit.

**Effort** : 15 min. Commande : `sudo sed -i 's/-log nolog/-log warning/g' /etc/pve/firewall/cluster.fw` sur galahad.

#### YubiKey sur cles SSH client

`ssh-keygen -t ed25519-sk`, deploy sur les 3 hosts, revoke anciennes cles. YubiKey deja en main.

**Effort** : 1h (user side).

#### Mot de passe GRUB (galahad + lancelot) — DEFERE

Suggestion Lynis BOOT-5122. **Defere** : risque lock boot remote (si patch /etc/grub.d/10_linux loupe, aucune entry boot sans password) >> gain marginal (attaquant avec acces physique peut deja booter USB). User-side seulement.

---

### P3 — Nice to have

- HIDS (Wazuh / CrowdSec une fois dispo Trixie).
- Bastion SSH LXC — Tailscale SSH couvre deja 80%.
- IDS reseau (Suricata / Zeek) — a considerer une fois OPNsense stable.
- Renommer LXC `guardian` -> `dns-failover` — FAIT 2026-04-14.
- Renommer Tailscale hosts `pve1`/`pve2` -> `galahad`/`lancelot` (UI tailscale, user side).
- Symlink `/vmlinuz` (Lynis KRNL-5788, cosmetique).

---

## Deja fait

??? success "Observabilite / documentation"
    - Threat model documente ([security.md](security.md))
    - Politique rotation / revocation documentee
    - Procedure revocation Tailscale ([network/tailscale-acls.md](../network/tailscale-acls.md))
    - Break-glass procedure ([break-glass.md](break-glass.md))
    - DR drill Vaultwarden (RTO 7s)
    - Scope token Cloudflare verifie (1 zone)

??? success "Backups"
    - Off-site B2 + SD card locale
    - Chiffrement client-side restic (AES-256, cle hors-Vaultwarden)
    - Retention 7d/4w/6m + prune automatique
    - **restic check mensuel** (1er du mois 4h, structure + 10% data subset)
    - **vzdump LXC hebdo** (galahad + lancelot, dimanche 1h, retention 4) + pull penny -> restic B2

??? success "Authentification"
    - Authelia 2FA (TOTP + WebAuthn FIDO2 YubiKey)
    - **Authelia regulation anti brute-force** (5 retries / 2min / ban 10min) — 2026-04-14
    - Consent mode `pre-configured` (1 an) sur tous les clients OIDC
    - SSH cles uniquement, ports custom, MaxAuthTries 3
    - Comptes `gabins` partout, plus de `gabin` legacy
    - Sudo NOPASSWD (cle SSH = auth forte)
    - SSH hardening Lynis (`AllowTcpForwarding no`, etc.)
    - **Login.defs hardened** (UMASK 027, ENCRYPT_METHOD YESCRYPT, SHA_CRYPT_MIN_ROUNDS 65536, PASS_MIN/MAX/WARN) sur penny+galahad+lancelot
    - **PAM password strength** (libpam-passwdqc), libpam-tmpdir, needrestart, apt-listbugs sur 3 hosts

??? success "OIDC SSO (Authelia)"
    - Proxmox galahad + lancelot (Administrator sur gabins@authelia)
    - Portainer
    - Beszel
    - Grafana (GrafanaAdmin, admin legacy desactive)
    - **Rotation 2026-04-13** des 4 client_secret + AdGuard bcrypt — plains stockes Vaultwarden

??? success "ForwardAuth Authelia (services sans OIDC natif)"
    - Traefik dashboard
    - Homepage (etait sans auth)
    - AdGuard primaire (etait bcrypt seul)
    - AdGuard secondaire dns-failover (route dns-failover.home.*)
    - **WUD** (etait expose anonyme + Traefik sans auth — ferme 2026-04-13)

??? success "Authelia session config explicite"
    - `expiration: 4h`
    - `inactivity: 30m`
    - `remember_me: 1M`

??? success "Traefik TLS hardening"
    - minVersion TLS 1.2 (TLS 1.3 default actif)
    - Cipher suites Mozilla intermediate (ChaCha20+AES-GCM ECDHE only)
    - Curves X25519/P256/P384
    - sniStrict (rejette SNI non-route)

??? success "Reseau"
    - Firewall iptables penny (INPUT DROP)
    - Firewall Proxmox cluster (galahad + lancelot)
    - **Firewall iptables LXC** (vault, logs, dns-failover) — INPUT DROP + whitelist par role
    - sysctl hardening (rp_filter, SYN flood, source route, martians)
    - **kernel.kptr_restrict=2 + kernel.yama.ptrace_scope=2** (galahad+lancelot ; YAMA n/a kernel RPi)
    - Rate limit Traefik Authelia (100 req/s SPA)
    - **`insecureSkipVerify` scope Proxmox only** (serversTransport dedie, retire du global Traefik) — 2026-04-14
    - DNSSEC validation (AdGuard primaire + dns-failover)
    - CAA records Cloudflare
    - Security headers HTTPS (HSTS, X-Frame, Referrer, Permissions-Policy)
    - **Topic ntfy randomise** (hex 32 chars, plus de topic previsible) — 2026-04-14

??? success "Containers"
    - docker-socket-proxy + reseau `socket` isole
    - `cap_drop: ALL` sur Authelia, Traefik, Homepage, WUD, Beszel
    - `no-new-privileges: true` global
    - ICC disabled sur bridge par defaut
    - Plus aucun port direct expose (tout via Traefik HTTPS)
    - **`read_only: true` + tmpfs** sur Traefik, Homepage, Beszel, WUD
    - **Pinning digests `@sha256:...`** sur Vaultwarden, Authelia, Traefik (supply chain)
    - **Cosign installe** (apt Trixie) — verifie : aucune des 3 images critiques n'est signed upstream, attendre evolution
    - Healthchecks Beszel + Portainer + beszel-agent : non applicable (images scratch/distroless, aucun outil CLI disponible)

??? success "Systemd-units hardening"
    - fail2ban : exposure 9.6 -> 4.7 (OK 🙂) sur penny+galahad+lancelot
    - ssh : exposure 9.6 -> 8.1 sur penny+galahad+lancelot
    - lynis : exposure 9.6 -> ~5
    - Docker/cron/getty : non hardened (besoin privileges, casserait service)

??? success "Audit / detection"
    - Lynis + cron hebdo + ntfy (penny 76, galahad 68, lancelot 69)
    - **auditd actif sur penny + galahad + lancelot** (auth, sudo, SSH, crontabs, firewall, Docker socket sur hosts Docker)
    - fail2ban (penny + galahad)
    - unattended-upgrades (penny + galahad)
    - rpcbind desactive (galahad + lancelot)

??? success "Observabilite"
    - Loki + Grafana Alloy sur LXC `logs`
    - Grafana renomme `logs.home.gabin-simond.fr`
    - Dashboards : Auth & Securite, Traefik Access, Logs Explorer
    - **Alerting rules** (Authelia auth failures, fail2ban bans, Traefik 5xx, auditd sudo) -> ntfy
    - Retention 30 jours

??? success "Surveillance / resilience"
    - Watchdog hardware BCM2835 (penny)
    - Autoheal (restart containers unhealthy)
    - Auto-recovery SSD (device rename detection)
    - Guardian LXC (health check externe penny depuis lancelot)
    - DNS redondant primaire/secondaire

??? success "Supply chain code"
    - Pre-commit hook anti-leak (`scripts/pre-commit-secret-scan.sh`) sur homelab-config + homelab-doc
    - Patterns : AWS, GitHub, Tailscale, B2, CF, PEM, password=, secret=

??? success "Secrets management"
    - **Authelia secrets externalises** (jwt, session, encryption_key, hmac → fichiers `/config/secrets/` chmod 600, charges via `AUTHELIA_*_FILE` env vars) — 2026-04-14
    - Cle JWKS OIDC dans `oidc.pem` separee (gitignored)
    - Configuration Authelia versionnable sans secrets inline

??? success "Migrations terminees"
    - Vaultwarden : penny SD card -> LXC 102 `vault` sur lancelot -> migre sur galahad (isolement logs, 2026-04-13)
    - Decommission container Vaultwarden penny prevu 2026-04-27
    - Proxmox cluster : pve1/pve2 -> galahad/lancelot
    - **Galahad + lancelot deja sur Trixie (Debian 13 / PVE 9.1.7 / kernel 6.17.2-1-pve)** — uniformite cluster
    - Tailscale : container -> host natif (SSH natif)
    - Wallos : supprime
