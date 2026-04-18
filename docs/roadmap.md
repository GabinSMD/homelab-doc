# Roadmap

## Phase 1 — Maintenant (preparation)

- [x] RPi 4 configure et operationnel
- [x] Cablage Cat 8 tire dans les pieces principales
- [x] Installer Proxmox VE sur les 2 ZimaBoard (voir [guide](guides/proxmox-zimaboard.md))
- [x] Creer le cluster Proxmox **homelab** (pve1 + pve2)
- [x] SSO centralise avec [Authelia](services/authelia.md) (OIDC pour Proxmox, Portainer, Beszel)
- [x] Deployer [Vaultwarden](services/vaultwarden.md) (gestionnaire de mots de passe)
- [x] Monitoring Beszel sur les 3 machines (RPi + pve1 + pve2)
- [x] Acheter switch manageable 2.5GbE — recu (8p 2.5G + SFP 10G)
- [x] Activer Tailscale SSH sur les 3 machines (RPi, pve1, pve2)
- [x] Backups automatiques quotidiens (volumes Docker + configs → SD card + ntfy)
- [x] Watchdog hardware BCM2835 (reboot auto si kernel freeze, timeout 15s)
- [x] Healthchecks Docker + autoheal (restart auto des containers unhealthy)
- [x] Auto-recovery SSD (remount + fsck + restart Docker apres deconnexion USB)
- [x] LXC "guardian" sur pve1 (AdGuard secondaire + health check externe RPi)
- [ ] Configurer DNS secondaire sur Freebox + Tailscale
- [ ] Se familiariser avec Proxmox (LXC, VM, cluster)

## Phase 2 — Avant emmenagement

- [ ] Migrer Tailscale du container Docker vers le host (RPi + pve1 + pve2)
- [ ] Brancher WD 2TB sur pve1 (SATA-Y + 2-Bay Rack), configurer PBS datastore
- [ ] Configurer le switch 2.5G (VLANs 802.1Q, trunk vers EdgeRouter Lite)
- [ ] Passer la Freebox en mode bridge
- [ ] Deployer EdgeRouter Lite comme routeur principal (NAT + firewall + VLANs)
- [ ] Tester les VLANs (Management 10, Services 20, LAN 30, IoT 40, Invites 50)
- [ ] Acheter APs WiFi VLAN-capable (Ubiquiti U6+ ou TP-Link EAP)
- [ ] Acheter patch panel Cat 8 blinde + coffret mural/baie 6U
- [ ] Evaluer si OPNsense est necessaire en complement de l'EdgeRouter Lite

## Phase 3 — Installation maison

- [ ] Installer coffret technique (patch panel + switch + firewall + UPS)
- [ ] Raccorder les cables Cat 8 (keystones blindes + mise a la terre)
- [ ] Deployer OPNsense + VLANs en production
- [ ] Freebox en bridge mode
- [ ] Installer les APs WiFi (1 SSID par VLAN)
- [ ] Migrer les services du RPi vers le cluster si pertinent

## Phase 4 — Consolidation

- [ ] Acheter Minisforum N5 Max (ou equivalent)
- [ ] Ajouter comme 3eme noeud Proxmox (compute + storage) → quorum natif
- [ ] Configurer ZFS mirror pour le stockage
- [ ] Mettre en place les backups (Proxmox Backup Server sur ZimaBoard → NAS)
- [x] Deployer AdGuard secondaire en LXC (redondance DNS) — LXC 100 "guardian" sur pve1
- [ ] UPS pour le coffret technique
