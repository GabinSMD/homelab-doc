# Roadmap

## Phase 1 — Maintenant (preparation)

- [x] RPi 4 configure et operationnel
- [x] Cablage Cat 8 tire dans les pieces principales
- [x] Installer Proxmox VE sur les 2 ZimaBoard (voir [guide](guides/proxmox-zimaboard.md))
- [x] Creer le cluster Proxmox **homelab** (galahad + lancelot)
- [x] SSO centralise avec [Authelia](services/authelia.md) (OIDC pour Proxmox, Portainer, Beszel)
- [x] Deployer [Vaultwarden](services/vaultwarden.md) (gestionnaire de mots de passe)
- [x] Monitoring Beszel sur les 3 machines (RPi + galahad + lancelot)
- [ ] Acheter switch manageable 2.5GbE (keepLINK 9XHML-X 8p managed ~62€)
- [x] Activer Tailscale SSH sur les 3 machines (RPi, galahad, lancelot)
- [x] Backups automatiques quotidiens (volumes Docker + configs → SD card + ntfy)
- [x] Watchdog hardware BCM2835 (reboot auto si kernel freeze, timeout 15s)
- [x] Healthchecks Docker + autoheal (restart auto des containers unhealthy)
- [x] Auto-recovery SSD (remount + fsck + restart Docker apres deconnexion USB)
- [x] LXC "guardian" sur galahad (AdGuard secondaire + health check externe RPi)
- [ ] Configurer DNS secondaire sur Freebox + Tailscale
- [ ] Se familiariser avec Proxmox (LXC, VM, cluster)

## Phase 2 — Avant emmenagement

- [ ] Acheter appliance OPNsense (Topton/CWWK N100 4x 2.5GbE, ~120€)
- [ ] Acheter switch 2.5GbE manageable 16+ ports (switch coeur)
- [ ] Acheter APs WiFi VLAN-capable
- [ ] Acheter patch panel Cat 8 blinde + coffret mural/baie 6U
- [ ] Installer OPNsense sur l'appliance, tester les VLANs

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
- [x] Deployer AdGuard secondaire en LXC (redondance DNS) — LXC 100 "guardian" sur galahad
- [ ] UPS pour le coffret technique
