# Roadmap securite

Priorisation pragmatique des actions de hardening restantes, classee par **impact / effort** plutot que par ordre chronologique.

Base : etat de `security.md` au commit `8fe1ed3` (13 avril 2026).

---

## Deja fait

### Observabilite / documentation
- [x] Threat model explicite documente (`security.md`)
- [x] Politique de rotation / revocation documentee
- [x] Procedure de revocation Tailscale
- [x] Break-glass procedure complete (`break-glass.md`)
- [x] DR drill Vaultwarden execute (RTO 7s)
- [x] Verification scope token Cloudflare (1 zone uniquement)

### Backups
- [x] Backups off-site B2 + SD card locale
- [x] **Chiffrement client-side restic** (AES-256, cle hors-Vaultwarden)
- [x] Retention 7d/4w/6m avec prune automatique

### Authentification
- [x] WebAuthn FIDO2 actif sur Authelia (YubiKey support)
- [x] Authelia 2FA TOTP + WebAuthn
- [x] SSH cles uniquement, ports custom, MaxAuthTries 3
- [x] Compte `gabins` + sudo NOPASSWD (remplace root interactif)
- [x] SSH hardening Lynis (`AllowTcpForwarding no`, `Compression no`, `MaxSessions 2`, `LogLevel VERBOSE`, `UseDNS no`)

### Reseau
- [x] Firewall iptables (INPUT DROP) sur penny
- [x] Firewall Proxmox cluster (galahad + lancelot)
- [x] sysctl hardening (rp_filter, SYN flood, source route, martians)
- [x] Rate limit Traefik sur Authelia (10 req/s)
- [x] DNSSEC validation (AdGuard primaire + guardian)
- [x] CAA records Cloudflare (Let's Encrypt + iodef)
- [x] Security headers HTTPS (HSTS, CSP, X-Frame, Referrer, Permissions)

### Containers
- [x] `docker-socket-proxy` avec endpoints whitelist + reseau `socket` isole
- [x] `cap_drop: ALL` sur Vaultwarden, Authelia, Traefik, Homepage, WUD, Beszel
- [x] `no-new-privileges: true` global (`daemon.json`)
- [x] Docker socket en read-only (backup pour Portainer)
- [x] ICC disabled sur bridge par defaut

### Audit / detection
- [x] **Lynis installe** (penny + galahad) avec weekly cron + ntfy
- [x] Score hardening: **penny 76/100, galahad 68/100**
- [x] **auditd** configure (penny + galahad) — auth, sudo, SSH config, crontabs, firewall, Docker socket
- [x] fail2ban actif (penny + galahad) avec IPs LAN/Tailscale ignorees
- [x] unattended-upgrades actif (penny + galahad)
- [x] rpcbind desactive (galahad + lancelot)

### Sirveillance
- [x] Watchdog hardware BCM2835 (penny)
- [x] Autoheal (restart containers unhealthy)
- [x] Auto-recovery SSD (device rename detection)
- [x] Guardian LXC (health check externe penny depuis lancelot)
- [x] DNS redondant primaire/secondaire

---

## P0 — Critiques court terme (< 1 jour cumule)

Les actions a plus haut ratio impact/effort.

### 1. Chiffrement client-side des backups B2

**Probleme** : le chiffrement precedent etait server-side B2. Un compte B2 compromis = backups accessibles.

**Action** : restic avec cle de chiffrement locale (AES-256 client-side).

**Status** : [x] Implemente (13 avril 2026)

**Configuration** :
- Repo : `b2:gabin-homelab-backups:restic` (meme bucket, sous-dossier dedie)
- Cle : AES-256, stockee dans `/root/.restic-env` (chmod 600, root-only)
- Credentials B2 : ID + Key reutilises de rclone config
- Integre au `homelab_backup.sh` quotidien (3h cron)

**Retention** :
- 7 snapshots quotidiens
- 4 snapshots hebdomadaires
- 6 snapshots mensuels
- Prune automatique apres chaque backup

**Coexistence** : les tar.gz legacy `rclone sync` sont gardes en parallele pendant 2-4 semaines pour double verification, avec `--exclude restic/**` pour ne pas ecraser restic.

**Important** : le mot de passe restic doit etre sauvegarde :
- Dans Vaultwarden (entree "Restic B2 backup")
- Sur une cle USB chiffree physiquement separee

**Sans le mot de passe = backups irrecouvrables.**

### 2. Scope du token Cloudflare API

**Probleme** : verifier que le token Traefik n'a pas des permissions globales.

**Permissions attendues** :
- `Zone:DNS:Edit` uniquement
- Scope : `gabin-simond.fr` uniquement (pas "All zones")
- Pas de `Zone:Zone:Read` global
- Pas de `User:User Details:Read`

**Effort** : 15 min.

**Status** : [x] Verifie (13 avril 2026) — 1 seule zone accessible, scope OK.

### 3. DR drill Vaultwarden

**Probleme** : `PRAGMA integrity_check` verifie le fichier, pas la capacite a restaurer depuis zero.

**Action** : sur une VM/LXC jetable :
1. Pull backup B2
2. Spin up Vaultwarden avec volume restaure
3. Se connecter + verifier credentials
4. Chronometrer : c'est le RTO reel

**Status** : [x] Teste (13 avril 2026)

**Resultats** :
- **RTO reel : 7 secondes** (download B2 → extract → container up + login page 200)
- DB SQLite integre : 1 user (`simond.gabin@proton.me`), 12 ciphers, 3 folders
- Dernier cipher : 2026-04-12 (cipher recent trouve)

**Procedure validee** :
```bash
DRILL_DIR=/tmp/vw-dr-drill
mkdir -p "$DRILL_DIR/restore"
rclone copy b2:gabin-homelab-backups/vaultwarden_LATEST.tar.gz "$DRILL_DIR/"
tar xzf "$DRILL_DIR"/vaultwarden_*.tar.gz -C "$DRILL_DIR/restore"
docker run -d --name vw-dr-test -v "$DRILL_DIR/restore:/data" -p 8089:80 vaultwarden/server:latest
# Login sur http://localhost:8089 avec master password
```

**A repeter** : tous les 3 mois minimum.

---

## P1 — Important moyen terme (1-3 jours cumule)

### 4. Lynis audit baseline + cron hebdomadaire

**Status** : [x] Done (13 avril 2026)
- penny : 76/100
- galahad : 68/100
- lancelot : non dispo (Trixie, package manquant)
- Cron weekly 5h dimanche avec ntfy

### 5. auditd + sysctl additionnels

**Status** : [x] Partiel
- [x] auditd installe sur penny + galahad avec regles custom (auth, sudo, SSH, crontabs, firewall, Docker socket)
- [ ] lancelot : bloque par manque de `audispd-plugins` sur Trixie (debloquera apres migration galahad vers Trixie)
- [ ] Sysctl additionnels (`yama.ptrace_scope=2`, `kptr_restrict=2`) — a completer

### 6. Loki + Grafana Alloy (centralisation logs)

**Decision** : Grafana Alloy plutot que Promtail (plus recent, remplace Promtail + Grafana Agent + OTel Collector).

**Architecture** :
- LXC 101 `observability` sur lancelot (192.168.1.31) : Loki + Grafana
- Grafana Alloy sur penny, galahad, lancelot
- Sources :
  - penny : journald + Docker logs + fail2ban + monitor script
  - galahad + lancelot : journald + audit.log + Proxmox logs + fail2ban
- Retention 30 jours
- Acces Grafana : `https://grafana.home.gabin-simond.fr` via Traefik + Authelia 2FA

**Status** : [x] Done (13 avril 2026)

**Dashboards a creer** :
- [ ] Auth failures (fail2ban, Authelia, sshd)
- [ ] Traefik access logs (4xx/5xx)
- [ ] audit events (auditd: sudo, SSH config changes, firewall)
- [ ] Container restarts (autoheal)
- [ ] Proxmox events

### 7. Durcir les `compose` services critiques

**Status** : [x] Partiel (6/11 services)
- [x] Vaultwarden, Authelia : `cap_drop ALL` + `cap_add` minimal
- [x] Traefik, Homepage, WUD, Beszel : `cap_drop ALL`
- [ ] AdGuard : impossible (DHCP + host network)
- [ ] Wallos : impossible (chmod /tmp au demarrage)
- [ ] Portainer : garde socket direct (admin tool)
- [ ] `read_only: true` : Authelia KO (ecrit /app/.healthcheck.env). A creuser pour Traefik et Homepage.

### 8. Migration Vaultwarden en LXC dedie

**Probleme** : Vaultwarden sur SD card penny = maillon faible sur stockage peu fiable.

**Action** : LXC Debian 13 sur **lancelot** (pas galahad, eviter co-localisation avec master quorum).

**Effort** : 2-3h incluant test login.

**Gain** : SSD ZFS redondant, snapshots hyperviseur, decouplage SPOF penny.

**Status** : [ ] A faire

### 9. Break-glass documentation formelle

**Status** : [x] Done (13 avril 2026) — `docs/infrastructure/break-glass.md`

### 10. Migration galahad vers Proxmox 9 (Trixie)

**Ajoute P1** — iso avec lancelot, debloque auditd et les paquets manquants.

**Risque** : migration cluster 1 node a la fois, ~1h downtime par node.

**Effort** : 2-3h.

**Status** : [ ] En cours

---

## P2 — Avant demenagement / Phase OPNsense

### 10. VLANs + OPNsense

Deja dans la roadmap existante (Phase 2). Rien a ajouter cote securite.

**Status** : [ ] Bloque par achat hardware

### 11. Chiffrement au repos

**Simplification apres P1-#8** : une fois Vaultwarden migre en LXC sur lancelot, penny devient "transient" (pas de secrets persistants). Plus besoin de LUKS sur penny. Reste :

- **ZimaBoards** : chiffrement ZFS natif au moment de la reinstall Trixie
  ```bash
  zpool create -O encryption=on -O keylocation=file:///root/zfs.key \
    -O keyformat=raw rpool mirror ...
  ```
- Cle stockee dans le TPM (a verifier sur ZimaBoard), sinon USB physiquement separee

**Effort** : non-trivial, a caler avec reinstall.

**Status** : [ ] Bloque par reinstall Trixie galahad

### 12. Supply chain Docker

WUD surveille mais pas de verification signature. Options :
- `cosign verify` sur images critiques en pre-pull
- Pinner les digests (`image: vaultwarden/server@sha256:...`)

**Effort** : 2-3h.

**Status** : [ ] A faire

### 13. Passphrase + YubiKey sur cles SSH client

Deja la YubiKey en main. `ssh-keygen -t ed25519-sk` pour cle resident sur la Yubi. Deploy `authorized_keys` sur les 3 hosts. Revoke anciennes cles.

**Effort** : 1h.

**Status** : [ ] A faire (user side)

---

## P3 — Nice to have

- **HIDS complet** (Wazuh / CrowdSec quand dispo Trixie) : duplique en partie auditd + Loki
- **Bastion host** : LXC dedie acces SSH centralise. Tailscale SSH couvre deja 80%
- **Network IDS** (Suricata / Zeek sur OPNsense) : a considerer une fois OPNsense stable

---

## Tableau synthetique

| Priorite | Action | Effort | Impact | Status |
|---|---|---|---|---|
| P0 | Chiffrement client-side B2 | 2h | Eleve | A faire |
| P0 | Scope token Cloudflare | 15min | Moyen | **Done** |
| P0 | DR drill Vaultwarden | 1h | Eleve | A faire |
| P1 | Lynis + cron | 3h | Moyen | A faire |
| P1 | auditd + sysctl | 3h | Moyen | A faire |
| P1 | Loki + Promtail | 4h | Eleve | A faire |
| P1 | Durcir composes (suite) | 3h | Moyen | Partiel |
| P1 | Migration Vaultwarden LXC | 3h | Tres eleve | A faire |
| P1 | Break-glass doc | 2h | Eleve si incident | A faire |
| P2 | VLANs / OPNsense | — | Eleve | Hardware |
| P2 | Chiffrement au repos (ZFS) | 1j | Eleve | Reinstall |
| P2 | Supply chain Docker | 3h | Moyen | A faire |
| P2 | YubiKey SSH | 1h | Eleve | User side |

**Budget total P0+P1** : ~3 jours de travail etales sur 2-4 semaines.

**Apres ca** : bien protege de l'exterieur → resilient a un incident reel et auditable.
