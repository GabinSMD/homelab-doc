# A propos

## Le projet

Ce homelab est ne d'une envie simple : **maitriser mon infrastructure de bout en bout**.

Plutot que de dependre de services cloud pour tout, j'ai voulu heberger mes propres services, comprendre comment fonctionne un réseau, et construire quelque chose de solide pour ma maison.

Le projet a démarre avec un Raspberry Pi 4 dans un boitier Argon ONE, un SSD, et une distribution légère (DietPi). Depuis, il a evolue vers une vision plus ambitieuse : une infrastructure multi-machines avec segmentation réseau, virtualisation, et bonnes pratiques empruntees au monde entreprise.

## Objectifs

- **Apprendre** — comprendre le réseau, la virtualisation, la sécurité, le stockage, en faisant plutot qu'en lisant
- **Heberger** — garder le contrôle sur mes données et mes services (DNS, reverse proxy, monitoring, media)
- **Construire** — preparer l'infrastructure réseau de ma future maison (renovation avec cablage Cat 8, VLANs, firewall)
- **Documenter** — partager le parcours, les choix, les erreurs, et les solutions pour que ca serve a d'autres

## Qui je suis

Je suis Gabin, passione d'infrastructure et de self-hosting. Ce projet est mon terrain de jeu pour apprendre les technos que j'utilisé ou que je veux maitriser :

- Linux (Debian/DietPi, administration système)
- Docker (conteneurisation, compose)
- Proxmox VE (virtualisation, LXC, clustering)
- OPNsense (firewall, VLANs, segmentation réseau)
- Réseau (cablage, switching, 802.1Q, 2.5GbE)

## Philosophie

Quelques principes qui guident les decisions techniques :

- **Pas de SPOF** — les services critiques (DNS, firewall) sont sur des machines dediees, independantes du cluster
- **Simple d'abord** — un seul docker-compose vaut mieux que 10 quand on est seul a maintenir
- **Documenter au fil de l'eau** — si c'est pas documenté, ca n'existe pas (d'ou ce site)
- **Budget raisonnable** — optimiser le rapport performance/prix, pas acheter le plus cher
- **Apprendre en faisant** — preferer une solution qu'on comprend a une boite noire qui "juste marche"

## Naming — le pantheon

Chaque machine porte un nom de code emprunte au monde de l'espionnage, des agents secrets et des heros de l'ombre.

| Machine | Nom | Référence | Pourquoi |
|---|---|---|---|
| RPi 4 | **penny** | Miss Moneypenny (James Bond) | Point de passage oblige du réseau — DNS, proxy, monitoring |
| ZimaBoard #1 | **galahad** | Galahad (Kingsman) | Premier agent du cluster Proxmox, fiable, toujours opérationnel |
| ZimaBoard #2 | **lancelot** | Lancelot (Kingsman) | Deuxieme agent, duo inseparable avec galahad |
| Minisforum (futur) | **luther** | Luther Stickell (Mission Impossible) | Cerveau technique : compute + NAS, le plus puissant |
| Firewall (futur) | **fury** | Nick Fury (Marvel) | Contrôler qui a acces a quoi — c'est le firewall |
| Assistant (futur) | **fish** | Scofield (Prison Break) | Intelligence calme, observé, exécuté, repare |

Le pantheon s'applique aux **machines physiques** uniquement. Les services Docker, LXC et subdomains restent **fonctionnels** (`vault`, `auth`, `monitor`, `logs`...).

## Ce site

Ce site est généré avec [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) et déployé automatiquement sur GitHub Pages via GitHub Actions.

Le code source est disponible sur [GitHub](https://github.com/GabinSMD/homelab-doc).
