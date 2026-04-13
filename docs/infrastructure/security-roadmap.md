# Roadmap securite

Etat au **2026-04-13**. Priorite : `impact / effort`.

> Pour la doctrine (threat model, politique credentials) : [security.md](security.md).
> Pour les implementations (sysctl, firewall, SSH) : [hardening.md](hardening.md).

---

## En cours / a faire

### P1 — Important

#### Migration galahad vers Trixie

**Gain** : iso avec lancelot, memes versions paquets, operations simplifiees.

**Risque** : migration cluster 1 node a la fois, ~1h downtime.

**Effort** : 2-3h.

---

### P2 — Avant demenagement / OPNsense

#### VLANs + OPNsense

Bloque par achat hardware. Voir [network/architecture-cible.md](../network/architecture-cible.md).

#### Chiffrement au repos (ZFS)

A caler avec reinstall Trixie galahad. Cle ZFS dans TPM ZimaBoard si dispo, sinon USB physiquement separee.

#### Cosign verification (binary install bloque sandbox)

Script pret : `scripts/cosign-verify.sh`. Install manuel cosign requis :
```bash
wget https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64 -O /usr/local/bin/cosign
chmod +x /usr/local/bin/cosign
```

#### YubiKey sur cles SSH client

`ssh-keygen -t ed25519-sk`, deploy sur les 3 hosts, revoke anciennes cles. YubiKey deja en main.

**Effort** : 1h (user side).

---

### P3 — Nice to have

- HIDS (Wazuh / CrowdSec une fois dispo Trixie).
- Bastion SSH LXC — Tailscale SSH couvre deja 80%.
- IDS reseau (Suricata / Zeek) — a considerer une fois OPNsense stable.
- Renommer LXC `guardian` -> nom fonctionnel (`dns-failover`) — coherence naming.
- Renommer Tailscale hosts `pve1`/`pve2` -> `galahad`/`lancelot` (UI tailscale, user side).

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
    - Consent mode `pre-configured` (1 an) sur tous les clients OIDC
    - SSH cles uniquement, ports custom, MaxAuthTries 3
    - Comptes `gabins` partout, plus de `gabin` legacy
    - Sudo NOPASSWD (cle SSH = auth forte)
    - SSH hardening Lynis (`AllowTcpForwarding no`, etc.)

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
    - AdGuard secondaire guardian (route adguard-guardian.home.*)

??? success "Reseau"
    - Firewall iptables penny (INPUT DROP)
    - Firewall Proxmox cluster (galahad + lancelot)
    - **Firewall iptables LXC** (vault, observability, guardian) — INPUT DROP + whitelist par role
    - sysctl hardening (rp_filter, SYN flood, source route, martians)
    - **kernel.kptr_restrict=2 + kernel.yama.ptrace_scope=2** (galahad+lancelot ; YAMA n/a kernel RPi)
    - Rate limit Traefik Authelia (100 req/s SPA)
    - DNSSEC validation (AdGuard primaire + guardian)
    - CAA records Cloudflare
    - Security headers HTTPS (HSTS, X-Frame, Referrer, Permissions-Policy)

??? success "Containers"
    - docker-socket-proxy + reseau `socket` isole
    - `cap_drop: ALL` sur Authelia, Traefik, Homepage, WUD, Beszel
    - `no-new-privileges: true` global
    - ICC disabled sur bridge par defaut
    - Plus aucun port direct expose (tout via Traefik HTTPS)
    - **`read_only: true` + tmpfs** sur Traefik, Homepage, Beszel, WUD
    - **Pinning digests `@sha256:...`** sur Vaultwarden, Authelia, Traefik (supply chain)

??? success "Audit / detection"
    - Lynis + cron hebdo + ntfy (penny 76, galahad 68, lancelot 69)
    - **auditd actif sur penny + galahad + lancelot** (auth, sudo, SSH, crontabs, firewall, Docker socket sur hosts Docker)
    - fail2ban (penny + galahad)
    - unattended-upgrades (penny + galahad)
    - rpcbind desactive (galahad + lancelot)

??? success "Observabilite"
    - Loki + Grafana Alloy sur LXC `observability`
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

??? success "Migrations terminees"
    - Vaultwarden : penny SD card -> LXC 102 `vault` sur lancelot -> migre sur galahad (isolement observability, 2026-04-13)
    - Decommission container Vaultwarden penny prevu 2026-04-27
    - Proxmox cluster : pve1/pve2 -> galahad/lancelot
    - Tailscale : container -> host natif (SSH natif)
    - Wallos : supprime
