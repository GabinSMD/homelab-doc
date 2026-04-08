# Decisions techniques

Architecture Decision Records (ADR) — pourquoi ces choix et pas d'autres.

## OS : DietPi plutot que Raspberry Pi OS

**Contexte** : Choisir une distribution pour un RPi 4 en mode serveur headless.

**Decision** : DietPi

**Pourquoi** :

- Plus leger que Raspberry Pi OS (moins de paquets pre-installes, pas de desktop)
- Logs en tmpfs par defaut (protege la SD card)
- Outils integres (`dietpi-config`, `dietpi-drive_manager`) pour gerer le hardware
- Base Debian (memes paquets, meme ecosysteme)
- Optimise pour ARM / SBC

**Alternative rejetee** : Raspberry Pi OS Lite — fonctionnel mais plus lourd, logs sur disque par defaut, plus de configuration manuelle pour un usage serveur.

---

## Reverse proxy : Traefik plutot que Nginx Proxy Manager

**Contexte** : Exposer des services internes en HTTPS avec des certificats automatiques.

**Decision** : Traefik

**Pourquoi** :

- Configuration via labels Docker — pas besoin de maintenir un fichier de config separe par service
- Detection automatique des nouveaux conteneurs
- Renouvellement TLS automatique via DNS challenge Cloudflare (pas besoin d'exposer le port 80 sur Internet)
- Configuration as code (versionnable)

**Alternative rejetee** : Nginx Proxy Manager — interface web plus simple, mais config stockee en base de donnees (moins versionnable), et le DNS challenge necessite des plugins supplementaires.

---

## DNS : AdGuard Home plutot que Pi-hole

**Contexte** : DNS resolver local avec ad-blocking.

**Decision** : AdGuard Home

**Pourquoi** :

- Interface plus moderne et reactive
- DNS-over-TLS / DNS-over-HTTPS natif
- DHCP integre (optionnel)
- Binaire unique, plus leger que Pi-hole (qui depend de lighttpd, PHP, etc.)
- Configuration en un seul fichier YAML

**Alternative rejetee** : Pi-hole — tres populaire et bien documente, mais stack plus lourde, interface vieillissante, et le DNS chiffre necessite des composants supplementaires.

---

## VPN : Tailscale plutot que WireGuard self-hosted

**Contexte** : Acces distant securise au homelab.

**Decision** : Tailscale

**Pourquoi** :

- Zero configuration reseau (NAT traversal automatique, pas de port forwarding)
- Mesh VPN (tous les devices se voient directement)
- MagicDNS pour la resolution de noms
- Gratuit pour un usage personnel (100 devices)
- Le trafic est chiffre en WireGuard point-a-point (le serveur de coordination ne voit pas le contenu)

**Alternative consideree** : Headscale (Tailscale self-hosted) — rejete car ajoute un SPOF sur le RPi pour un gain de souverainete minimal (le coordination server ne voit pas le trafic).

**Alternative rejetee** : WireGuard bare — plus de controle, mais configuration manuelle de chaque peer, gestion des cles, port forwarding sur la box, pas de NAT traversal.

---

## Monitoring : Beszel plutot que Grafana/Prometheus

**Contexte** : Monitoring systeme pour un petit homelab.

**Decision** : Beszel

**Pourquoi** :

- Leger (un seul binaire + agent)
- Dashboard integre, pas besoin de configurer Grafana + Prometheus + exporters
- Adapte a un petit homelab (1-10 machines)

**Alternative rejetee** : Grafana + Prometheus — puissant mais overkill pour quelques machines. Stack lourde (Prometheus, node_exporter, Grafana), configuration complexe, et consomme plus de ressources.

---

## Firewall : Appliance dediee plutot que VM Proxmox

**Contexte** : Faire tourner OPNsense pour la segmentation VLANs.

**Decision** : Appliance bare-metal dediee (Topton/CWWK N100, 4x 2.5GbE)

**Pourquoi** :

- Pas de SPOF — si un noeud Proxmox tombe, le reseau continue de fonctionner
- Libere les deux ZimaBoard pour du compute (3 noeuds Proxmox avec quorum)
- 4 ports 2.5GbE natifs (pas de VLAN-on-a-stick)
- ~120€ — investissement raisonnable vu ce que ca debloque

**Alternative rejetee** : OPNsense en VM sur un ZimaBoard — perd un noeud Proxmox, et si ce ZimaBoard tombe, plus de reseau.

---

## Stockage : SSD USB plutot que boot sur SSD

**Contexte** : Le RPi 4 peut booter sur USB, mais l'Argon ONE M.2 utilise un bridge USB-SATA.

**Decision** : Boot sur SD Card, donnees sur SSD

**Pourquoi** :

- Le bridge ASMedia ASM1156 a des problemes de stabilite (deconnexions PCIe ASPM) — garder l'OS sur la SD card assure que le systeme boot meme si le SSD a un souci
- `nofail` dans fstab — le systeme demarre sans le SSD
- Les logs en tmpfs protegent la SD card de l'usure
- Docker data-root sur le SSD — les ecritures lourdes vont sur le SSD, pas la SD

**Alternative rejetee** : Boot complet sur SSD — plus rapide au boot, mais si le bridge USB deconnecte, le systeme entier crash (kernel panic). Trop risque avec ce bridge.
