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

## Monitoring : Beszel (metriques) + Grafana/Loki (logs) — complementaires

**Contexte** : Observabilite pour un petit homelab (1-10 hosts).

**Decision** : Beszel pour les metriques, Grafana+Loki pour les logs. **Pas de Prometheus / node_exporter**.

**Pourquoi** :

- Beszel seul couvre 100% des besoins metriques systeme (CPU, RAM, disk, net, containers) — pas de valeur ajoutee a reinstaller Prometheus + node_exporter.
- Grafana+Loki couvre ce que Beszel ne fait pas : recherche dans les logs applicatifs, events auditd, echecs d'auth, analyse Traefik access logs.
- Les deux outils ont chacun leur dashboard : `monitor.home...` (Beszel) et `logs.home...` (Grafana).
- Sans doublon, chaque outil reste leger.

**Decouplage delibere** : Grafana tourne dans un LXC dedie (`logs` sur lancelot), pas sur penny. Benefice : si penny tombe, on peut analyser les logs depuis l'infra Proxmox; inversement, un crash logs n'affecte pas les services.

**Alternative rejetee** : stack Prometheus+node_exporter+Grafana pour les metriques — redondant avec Beszel, plus lourd, plus complexe a maintenir.

---

## Grafana 100% OIDC — aucun compte admin local

**Contexte** : Grafana livre un compte `admin` par defaut avec mot de passe static. Politique credentials du homelab : **zero compte admin local**, tout via Authelia.

**Decision** :

- `GF_AUTH_DISABLE_LOGIN_FORM=true` + `GF_AUTH_BASIC_ENABLED=false` : impossible de se connecter autrement qu'en OIDC.
- `GF_AUTH_OAUTH_AUTO_LOGIN=true` : redirection directe vers Authelia.
- Role mapping : groupe `admins` Authelia → `GrafanaAdmin`.
- Compte legacy `admin` : `is_disabled=1` + password efface en DB SQLite.
- Pas de break-glass dedie : Grafana = service non critique (lecture de logs). Si Authelia tombe, on repasse en mode basic temporairement via edition du compose.

**Pourquoi** : respecter la politique uniformement. Grafana n'est pas un service critique → pas de break-glass.

---

## ZFS encryption at-rest — skip pour le homelab

**Contexte** : la roadmap securite listait "chiffrement ZFS at-rest" en P2.

**Decision** : skip.

**Pourquoi** :

- Modele de menace homelab domicile : risque vol physique faible (cambriolage normal cible cash/electro, pas un ZimaBoard).
- Donnees vraiment sensibles = Vaultwarden master password — deja chiffre Argon2id par design.
- Backups B2 deja chiffres client-side (restic AES-256).
- ZFS encryption protege uniquement disque eteint OU saisie/RMA. Pas un attaquant root, pas une compromission reseau.
- Cout : reinstall complete Proxmox en ZFS-on-root + boot non-unattended (passphrase au boot = casse `homelab_monitor.sh`, watchdog auto-recovery, restart via WoL).
- Workaround clef USB physique = fragilise (clef perdue = donnees perdues).

**A reconsiderer si** : demenagement avec serveurs en transit, ou stockage donnees client/medical/financier.

**Alternative gain superieur** : YubiKey FIDO2 SSH (vrai gain — supprime le risque "cle SSH volee = root immediat").

---

## Wallos supprime

**Contexte** : Wallos (tracker d'abonnements) installe initialement, peu utilise.

**Decision** : Supprime (container + volumes + routes Traefik + entree Homepage).

**Pourquoi** : surface d'attaque additionnelle pour un usage marginal. Suppression > maintenance.

---

## Security headers : pas de CSP global, per-route headers

**Contexte** : hardening HTTPS via security-headers Traefik middleware (HSTS, X-Frame, Referrer-Policy, Permissions-Policy, CSP, COOP, CORP).

**Decision** : CSP retire du middleware global. Security-headers appliques per-route (Docker labels), PAS au niveau entrypoint.

**Pourquoi** :

- CSP global (`default-src 'self'`) casse les SPA : Beszel (SvelteKit), Proxmox (ExtJS), Portainer (Angular). Chaque framework a des besoins differents (inline scripts, eval, WebSocket `wss:`, data URIs).
- `Cross-Origin-Opener-Policy: same-origin` casse le flow OIDC redirect (popup → Authelia → retour app = opener reference perdue). Fix : `same-origin-allow-popups`.
- TLS 1.3 strict (`minVersion: VersionTLS13`) rollback : tous les clients modernes le supportent mais des interactions subtiles avec sniStrict causaient des timeouts.
- Proxmox ExtJS est particulierement fragile → PVE routes n'ont AUCUN security header Traefik.

**Headers conserves en global** (per-route via Docker labels) : HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

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

---

## Updates Docker : Watchtower plutot que WUD

**Contexte** : WUD (What's Up Docker) surveillait les mises a jour images mais exposait une API web anonyme sur le reseau interne (item securite P2 ouvert, auth interne cassee).

**Decision** : Migration vers Watchtower (headless)

**Pourquoi** :

- **Zero surface d'attaque** — pas de port, pas d'API, pas de route Traefik. Ferme l'item P2 "WUD auth interne"
- **Auto-update** des services non-critiques (homepage, beszel, beszel-agent, autoheal) — plus de maintenance manuelle
- **Monitor-only** sur les critiques (traefik, authelia, portainer, adguard, socket-proxy) via label `com.centurylinklabs.watchtower.monitor-only=true` — notification ntfy quand nouvelle version dispo
- Plus leger (30 MB vs 357 MB)
- Notification ntfy en mode report : silence si RAS, resume sinon (maj OK / echec / maintenance requise)
- Cleanup automatique des anciennes images

**Alternative rejetee** : Garder WUD — API interne anonyme non corrigeable (bug confirme), surface d'attaque inutile pour un dashboard peu consulte.

---

## Cluster quorum : qdevice sur penny plutot que 3e node PVE

**Contexte** : Cluster 2-node perd systematiquement quorum quand un node tombe (confirme incident 2026-04-19 lancelot down ~6h, galahad paralyse meme quorate=1/2).

**Decision** : `corosync-qnetd` sur penny (2026-04-19)

**Pourquoi** :

- **Penny est deja la** — RPi 4 toujours on, Tailscale, firewall, maintenu. Zero materiel nouveau.
- **1 vote arbitraire** — penny ne heberge pas de LXC, juste le vote. Simple a maintenir.
- **30 min deploiement** vs investissement hardware + setup Proxmox sur un 3e machine (~500€ + 1 journee)
- **Pattern officiel Proxmox** : documente, supporte, `pvecm qdevice setup` built-in
- Survit aux pannes les plus frequentes (1 node down)

**Alternative rejetee** : Attendre le Minisforum N5 Max (phase 4 roadmap) — trop d'attente vu l'incident recurrent. qdevice est une etape intermediate qui peut rester meme apres le 3e node.

**Tradeoff** : penny devient indirectement critique pour les operations cluster (pas juste pour ses services). Si penny + 1 node PVE tombent simultanement = 1/3 vote = perte quorum. Double-fault extreme, acceptable.

---

## Docker log-driver : json-file plutot que journald (ARM)

**Contexte** : Sur ARM (penny RPi 4), dockerd crash SIGBUS dans le reader `sdjournal` quand journald rotate les files. 5 restarts docker en 24h le 2026-04-19, containers massivement down.

**Decision** : log-driver `json-file` + rotation `max-size=10m max-file=3` (2026-04-19)

**Pourquoi** :

- **Battle-tested** — default Docker, pas de cgo fragile (sdjournal utilise libsystemd via cgo, crash SIGBUS sur read mmap pendant rotation)
- **Rotation builtin** — max-size/max-file evite le bloat disque (sans ca, json-file accumule indefiniment)
- **Compatible shipping Loki** — Alloy a `loki.source.docker` qui lit via socket API (pas via journald), fonctionne idem
- **Bug ARM-specific** — Pi rotate agressivement journald (SystemMaxUse serre), x86 moins impacte

**Alternative rejetee** : Downgrade Docker ou journald SystemMaxUse=... — workarounds fragiles, bug reapparait au prochain update Docker. json-file elimine categoriquement la classe de crash.

**Impact** : `journalctl CONTAINER_NAME=X` ne marche plus (logs pas dans journald). `docker logs X` continue de marcher. Shipping Loki via Alloy continue.

---

## Alloy HA : dual-write primary + replica au lieu de single Loki

**Contexte** : Loki tourne dans LXC 101 sur lancelot. Si lancelot tombe, observabilite perdue pendant la panne (alors que c'est justement quand on en a le plus besoin).

**Decision** : dual-write depuis les 3 hosts vers Loki primary (lancelot:3100) + replica (penny:3101) (2026-04-19)

**Pourquoi** :

- **Replica etait deja en place** pour penny (dual-write existant depuis deploy) — etendre aux 2 nodes PVE = 5 min config Alloy par node
- **Survit a lancelot down** — Grafana depuis loki-replica via URL alternative
- **WAL Alloy** — chaque Alloy buffer localement si un sink est down, rejoue au retour. Zero perte.
- **Cout quasi-nul** — meme images Docker, meme storage (replica dans container sur penny SSD)

**Alternative rejetee** : Loki cluster-mode (microservices) — overkill pour 3 hosts, complexite operationnelle >> gain resilience.

---

## Secrets at-rest : sops + age + tmpfs plutot que Vault / Bitwarden CLI

**Contexte** : Secrets Authelia (JWT, OIDC keys) et CrowdSec credentials etaient en clair dans le repo `homelab-config` (sur Github prive mais toujours expose a qui volerait le token). Besoin : chiffrement at-rest, dechiffrement automatique au boot.

**Decision** : `sops` + age + scellement in-place + unseal vers tmpfs `/run/homelab/` au boot (systemd unit) (2026-04-17 → 2026-04-19 finalise)

**Pourquoi** :

- **Git-friendly** — sops chiffre au niveau champ YAML, diff lisible, pas de blob opaque
- **age** — cle moderne (X25519), plus simple que GPG, supporte YubiKey (`age-plugin-yubikey`) pour DR physique
- **tmpfs** — secrets dechiffres jamais sur disque, efface au shutdown. Le service Docker bind-mount la tmpfs dans le container (RO pour authelia, RW pour crowdsec car entrypoint reecrit)
- **Boot-time** — `homelab-unseal.service` systemd fait le dechiffrement, puis `docker.service` demarre (dependance ordre)
- **Fail-safe** — si unseal echoue, Docker demarre mais les bind-mounts pointent vers des fichiers inexistants → containers cassent en erreur explicite (vs demarrent avec secrets vides = drift silencieux)

**Alternative rejetee** :
- Vault — agent overhead, complexite d'operation pour 5 secrets, pas git-native
- Bitwarden CLI — plaintext au moment du fetch, dependance runtime au vault Vaultwarden (circulaire : vault backup contient ses propres secrets)

**Piege documente** : CrowdSec credentials doivent etre bind-mount `:rw` (entrypoint reecrit au boot). Le fichier `console.yaml` n'est pas scelle (booleans sans secret, pas de bind-mount tmpfs dans compose).
