# Homelab Doc

Documentation du homelab — generee avec [MkDocs Material](https://squidfunk.github.io/mkdocs-material/).

## Consulter

Le site est deploye automatiquement sur GitHub Pages :
**https://homelab.gabin-simond.fr/**

## Developper en local

```bash
pip install mkdocs-material mkdocs-mermaid2-plugin
mkdocs serve
```

Le site est accessible sur `http://localhost:8000`.

## Structure

```
docs/
├── index.md                       # Accueil + architecture
├── infrastructure/
│   ├── hardware.md                # Materiel actuel et prevu
│   ├── os-optimizations.md        # Optimisations DietPi/RPi4
│   ├── security.md                # Doctrine securite, credentials, secrets
│   ├── hardening.md               # Mesures techniques par couche
│   ├── security-roadmap.md        # Roadmap securite (P1/P2/P3 + done)
│   ├── break-glass.md             # Procedure de reconstruction d'urgence
│   ├── monitoring.md              # Monitoring et alertes
│   ├── backups.md                 # Architecture backups + restauration
│   └── troubleshooting.md         # Maintenance courante + depannage
├── services/
│   ├── naming.md                  # Convention de noms (pantheon)
│   ├── docker-stack.md            # Vue d'ensemble Docker (penny)
│   ├── traefik.md                 # Reverse proxy + TLS + middlewares
│   ├── adguard.md                 # DNS ad-blocking
│   ├── authelia.md                # SSO / OIDC / ForwardAuth
│   ├── vaultwarden.md             # Gestionnaire de mots de passe
│   ├── grafana.md                 # Logs centralises (Loki + Grafana)
│   └── acces.md                   # Reference rapide URLs et ports
├── network/
│   ├── architecture-cible.md      # Schema reseau cible
│   ├── vlans.md                   # Plan VLANs et firewall
│   └── tailscale-acls.md          # VPN mesh et ACLs
├── guides/
│   ├── ajouter-service.md         # Deployer un service Docker
│   ├── proxmox-zimaboard.md       # Installer Proxmox sur eMMC
│   ├── dns-flow.md                # Comment fonctionne le DNS
│   └── tls.md                     # TLS et certificats
├── decisions.md                   # ADR (Architecture Decision Records)
├── roadmap.md                     # Phases d'installation
└── about.md                       # A propos du projet
```
