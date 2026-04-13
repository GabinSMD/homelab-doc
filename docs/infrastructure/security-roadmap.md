# Roadmap securite

Etat au **2026-04-13**. Priorite : `impact / effort`.

> Pour la doctrine (threat model, politique credentials) : [security.md](security.md).
> Pour les implementations (sysctl, firewall, SSH) : [hardening.md](hardening.md).

---

## En cours / a faire

### P1 — Important

#### Sysctl additionnels

**A completer** sur penny, galahad, lancelot :

```ini
kernel.yama.ptrace_scope=2
kernel.kptr_restrict=2
```

**Effort** : 10 min.

#### Migration galahad vers Trixie

**Gain** : iso avec lancelot, memes versions paquets, operations simplifiees. N'aide **pas** auditd (voir ci-dessous).

**Risque** : migration cluster 1 node a la fois, ~1h downtime.

**Effort** : 2-3h.

#### auditd sur lancelot

**Probleme** : auditd refuse de demarrer sur lancelot (dependencies kernel / context). Masque actuellement. Meme cause sur galahad une fois migre vers Trixie.

**Piste** : utiliser `laurel` ou `go-audit` comme userspace reader alternatif (pas de dependency kernel).

---

### P2 — Avant demenagement / OPNsense

#### VLANs + OPNsense

Bloque par achat hardware. Voir [network/architecture-cible.md](../network/architecture-cible.md).

#### Chiffrement au repos (ZFS)

A caler avec reinstall Trixie galahad. Cle ZFS dans TPM ZimaBoard si dispo, sinon USB physiquement separee.

#### Supply chain Docker

`cosign verify` ou pinning digests sur images critiques (Vaultwarden, Authelia, Traefik).

**Effort** : 2-3h.

#### YubiKey sur cles SSH client

`ssh-keygen -t ed25519-sk`, deploy sur les 3 hosts, revoke anciennes cles. YubiKey deja en main.

**Effort** : 1h (user side).

---

### P3 — Nice to have

- HIDS (Wazuh / CrowdSec une fois dispo Trixie) — duplique partiellement auditd + Loki.
- Bastion SSH LXC — Tailscale SSH couvre deja 80%.
- IDS reseau (Suricata / Zeek) — a considerer une fois OPNsense stable.

---

## Deja fait

??? success "Observabilite / documentation"
    - Threat model documente ([security.md](security.md))
    - Politique rotation / revocation documentee
    - Procedure revocation Tailscale
    - Break-glass procedure ([break-glass.md](break-glass.md))
    - DR drill Vaultwarden (RTO 7s)
    - Scope token Cloudflare verifie (1 zone)

??? success "Backups"
    - Off-site B2 + SD card locale
    - Chiffrement client-side restic (AES-256, cle hors-Vaultwarden)
    - Retention 7d/4w/6m + prune automatique

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

??? success "Reseau"
    - Firewall iptables penny (INPUT DROP)
    - Firewall Proxmox cluster (galahad + lancelot)
    - sysctl hardening (rp_filter, SYN flood, source route, martians)
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
    - `read_only: true` + tmpfs sur Traefik + Homepage (teste 2026-04-13)
    - Pinning digests `@sha256:...` sur Vaultwarden, Authelia, Traefik (supply chain)

??? success "ForwardAuth Authelia (services sans OIDC natif)"
    - Traefik dashboard
    - Homepage (etait sans auth)
    - AdGuard primaire (etait bcrypt seul)
    - AdGuard secondaire guardian (nouveau route adguard-guardian.home.*)

??? success "Rotation secrets"
    - 4 clients OIDC rotates 2026-04-13 (proxmox, portainer, grafana, beszel)
    - AdGuard bcrypt rotated 2026-04-13 (penny + guardian)
    - Pre-commit hook anti-leak (scripts/pre-commit-secret-scan.sh)
    - Plains stockes dans Vaultwarden

??? success "Audit / detection"
    - Lynis + cron hebdo + ntfy (penny 76, galahad 68, lancelot 69)
    - auditd (penny + galahad) — auth, sudo, SSH, crontabs, firewall, Docker socket
    - fail2ban (penny + galahad)
    - unattended-upgrades (penny + galahad)
    - rpcbind desactive (galahad + lancelot)

??? success "Observabilite"
    - Loki + Grafana Alloy sur LXC `observability`
    - Grafana renomme `logs.home.gabin-simond.fr`
    - Dashboards : Auth & Securite, Traefik Access, Logs Explorer
    - Retention 30 jours

??? success "Surveillance / resilience"
    - Watchdog hardware BCM2835 (penny)
    - Autoheal (restart containers unhealthy)
    - Auto-recovery SSD (device rename detection)
    - Guardian LXC (health check externe penny depuis lancelot)
    - DNS redondant primaire/secondaire

??? success "Migrations terminees"
    - Vaultwarden : penny SD card → LXC 102 `vault` sur lancelot → migre sur galahad (isolement observability, 2026-04-13)
    - Decommission container Vaultwarden penny prevu 2026-04-27
    - Proxmox cluster : pve1/pve2 → galahad/lancelot
    - Tailscale : container → host natif (SSH natif)
    - Wallos : supprime (pas d'utilite)
