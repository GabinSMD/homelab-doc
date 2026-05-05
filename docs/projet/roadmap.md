# Roadmap

> **Mise a jour 2026-05-05** — Phase 1 quasi-complete (1 vrai gap : UPS). Phases 2-4 bloquees hardware/demenagement. Voir aussi [Roadmap sécurité](../securite/roadmap.md) et [Fish roadmap](fish.md#roadmap).

## Phase 1 — Foundation (preparation domicile actuel)

### Infrastructure de base

- [x] RPi 4 configuré et opérationnel (DietPi, hostname penny)
- [x] Cablage Cat 8 tire dans les pieces principales
- [x] Installer Proxmox VE 9 sur les 2 ZimaBoard
- [x] Créer le cluster Proxmox **homelab** (galahad + lancelot)
- [x] **Cluster Qdevice penny** = 3 votes (survit perte 1 node) — 2026-04-19
- [x] Switch manageable 2.5GbE 8p achete + plug — config minimal a faire (30 min UI)
- [x] Tailscale SSH sur les 3 hosts + LXCs

### Services applicatifs

- [x] SSO centralise [Authelia](../services/authelia.md) (OIDC : Proxmox, Portainer, Beszel, PBS, Grafana)
- [x] [Vaultwarden](../services/vaultwarden.md) (LXC 102 vault sur galahad)
- [x] Beszel monitoring 3 machines
- [x] AdGuard Home primaire (penny) + secondaire (LXC 100 dns-failover sur galahad)
- [x] Logs HA : Loki primary (LXC 101 lancelot) + replica (penny), Alloy dual-write 3 hosts
- [x] Grafana dashboards (Homelab Overview, Auth & Sécurité, Traefik Access, Logs)
- [x] PBS (LXC 103 lancelot, NFS datastore penny, retention 7d/4w/3m)

### Backups + DR

- [x] Backups quotidiens restic → B2 chiffre AES-256 (4 chaines : penny, vault hourly, logs, dns-failover)
- [x] PBS daily backup LXCs (galahad 02:00, lancelot 02:30)
- [x] restic check mensuel (structure + 10% data subset)
- [x] DR drill mensuel automatique (restore + verify echantillon)
- [x] Sops + age + 2 YubiKeys DR (break-glass)
- [ ] **DR drill from cold** — restore B2 + sops sur Pi neuf, chronometrage. Seule preuve reelle que la chain DR fonctionne end-to-end (1/2 journee user)

### Resilience

- [x] Watchdog hardware BCM2835 (reboot auto si kernel freeze, timeout 15s)
- [x] Healthchecks Docker + autoheal (restart auto des containers unhealthy)
- [x] Auto-recovery SSD (remount + fsck + restart Docker après deconnexion USB)
- [x] Auto-repair docker stack (compose up -d auto si stack vide + circuit breaker 3/24h)
- [x] Cascade alert suppression (`house-down`/`lancelot-down` suppriment alertes enfants)
- [x] Healthchecks.io deadman external (penny ping every 1min depuis monitor, alerte si silent)
- [ ] **UPS achat + setup NUT** (~80€ APC Back-UPS 700VA) — vrai gap reliability, coupure courant = corruption eMMC potentielle

### Observabilite + alerting

- [x] Notif hygiene mode "uniquement quand ne va pas" (silence success, only failures bipe)
- [x] Logs persistents SSD (`/mnt/ssd/log-homelab/`, post-DietPi RAMlog fix)
- [x] [Fish SRE engine](fish.md) v1+v1.5+W5 déployé en prod (catalog-gated incident response + auto-pattern drafter)
- [x] Fish-down canary Tailscale (homelab_monitor.check_fish_service)
- [x] Monitor → Loki shipping (alertes monitor pushed dans Loki, fish observé)

### Sécurité (voir [sécurité/roadmap.md](../securite/roadmap.md))

- [x] Audit CSO complet 2026-04-19 (0 HIGH/CRIT, 2 MEDIUM dont 1 corrige)
- [x] Egress firewall Phase 2 (DROP outbound + port-based whitelist) sur 3 hosts — 2026-05-05
- [x] YubiKey SSH client (sk-ssh-ed25519 sur 3 hosts)
- [ ] **TFA root@pam Proxmox** (5 min UI Datacenter→Permissions→Two Factor)

## Phase 2 — Avant emmenagement (bloquee hardware)

- [ ] Acheter appliance OPNsense (Topton/CWWK N100 4x 2.5GbE, ~120€)
- [ ] Acheter switch 2.5GbE manageable 16+ ports (switch coeur)
- [ ] Acheter APs WiFi VLAN-capable
- [ ] Acheter patch panel Cat 8 blinde + coffret mural/baie 6U
- [ ] Installer OPNsense sur l'appliance, tester les VLANs

## Phase 3 — Installation maison

- [ ] Installer coffret technique (patch panel + switch + firewall + UPS)
- [ ] Raccorder les cables Cat 8 (keystones blindes + mise a la terre)
- [ ] Déployer OPNsense + VLANs en production
- [ ] Freebox en bridge mode
- [ ] Installer les APs WiFi (1 SSID par VLAN)
- [ ] Migrer les services du RPi vers le cluster si pertinent

## Phase 4 — Consolidation

- [ ] Acheter Minisforum N5 Max "luther" (ou équivalent)
- [ ] Ajouter comme 3eme nœud Proxmox (compute + storage) → quorum natif sans qdevice
- [ ] Configurer ZFS mirror pour le stockage (debloque vzdump --mode snapshot, fin des PBS backup window whitelists)
- [ ] PBS sur ZimaBoard → NAS Minisforum
- [ ] [Ollama local](fish.md#roadmap) sur luther = backup LLM pour fish quand budget Claude API serre
- [ ] Replicate fish Option B sur galahad+lancelot = couverture cluster complete

## Items hors-phases (process / value-add)

### Quality of life développement

- [ ] **Renovate ou Dependabot** sur homelab-config repo (auto-PR pour deps Python fish + scripts)
- [ ] **CI/CD GitHub Actions** sur homelab-config (pytest fish + ruff + bash -n + secret scan avant merge)
- [ ] Synthetic monitoring externe (healthchecks par service public — homelab.gabin-simond.fr etc)

### Nouveaux services (selon usage perso)

- [ ] [Immich](https://immich.app/) — self-hosted Google Photos (1 weekend setup + storage)
- [ ] [Paperless-ngx](https://docs.paperless-ngx.com/) — OCR + indexation factures/documents
- [ ] [Home Assistant](https://www.home-assistant.io/) — domotique quand IoT a integrer

### Sécurité hardening (paranoia level)

- [ ] [Trivy](https://github.com/aquasecurity/trivy) schedule — vuln scan images Docker hebdo
- [ ] AIDE/Tripwire — file integrity monitoring `/etc /usr`
- [ ] SMTP migration port 25 → 587 auth submission (PVE postfix)
- [ ] HIDS (Wazuh / CrowdSec extension)

### Reproductibilite

- [ ] **Ansible playbook** ou Nix flake pour reconstruire penny depuis git en 1 commande
