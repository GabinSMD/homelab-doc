# Homelab Doc

Documentation du homelab — generee avec [MkDocs Material](https://squidfunk.github.io/mkdocs-material/).

## Consulter

Le site est deploye automatiquement sur GitHub Pages :
**https://gabinsmd.github.io/homelab-doc/**

## Developper en local

```bash
pip install mkdocs-material mkdocs-mermaid2-plugin
mkdocs serve
```

Le site est accessible sur `http://localhost:8000`.

## Structure

```
docs/
├── index.md                    # Accueil
├── infrastructure/
│   ├── hardware.md             # Materiel actuel et prevu
│   ├── os-optimizations.md     # Optimisations DietPi/RPi4
│   └── monitoring.md           # Monitoring et alertes
├── services/
│   ├── docker-stack.md         # Vue d'ensemble Docker
│   ├── traefik.md              # Reverse proxy
│   └── adguard.md              # DNS ad-blocking
├── network/
│   ├── architecture-cible.md   # Schema reseau maison
│   └── vlans.md                # Plan VLANs et firewall
└── roadmap.md                  # Phases d'installation
```
