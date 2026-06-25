# Decisions techniques

Architecture Decision Records (ADR) — pourquoi ces choix et pas d'autres.

## OS : DietPi plutôt que Raspberry Pi OS

**Contexte** : Choisir une distribution pour un RPi 4 en mode serveur headless.

**Decision** : DietPi

**Pourquoi** :

- Plus léger que Raspberry Pi OS (moins de paquets pre-installes, pas de desktop)
- Logs en tmpfs par defaut (protégé la SD card)
- Outils intégrés (`dietpi-config`, `dietpi-drive_manager`) pour gérer le hardware
- Base Debian (mêmes paquets, même ecosysteme)
- Optimise pour ARM / SBC

**Alternative rejetee** : Raspberry Pi OS Lite — fonctionnel mais plus lourd, logs sur disque par defaut, plus de configuration manuelle pour un usage serveur.

---

## Reverse proxy : Traefik plutôt que Nginx Proxy Manager

**Contexte** : Exposer des services internes en HTTPS avec des certificats automatiques.

**Decision** : Traefik

**Pourquoi** :

- Configuration via labels Docker — pas besoin de maintenir un fichier de config séparé par service
- Détection automatique des nouveaux conteneurs
- Renouvellement TLS automatique via DNS challenge Cloudflare (pas besoin d'exposer le port 80 sur Internet)
- Configuration as code (versionnable)

**Alternative rejetee** : Nginx Proxy Manager — interface web plus simple, mais config stockée en base de données (moins versionnable), et le DNS challenge nécessité des plugins supplémentaires.

---

## DNS : AdGuard Home plutôt que Pi-hole

**Contexte** : DNS resolver local avec ad-blocking.

**Decision** : AdGuard Home

**Pourquoi** :

- Interface plus moderne et reactive
- DNS-over-TLS / DNS-over-HTTPS natif
- DHCP intégré (optionnel)
- Binaire unique, plus léger que Pi-hole (qui dépend de lighttpd, PHP, etc.)
- Configuration en un seul fichier YAML

**Alternative rejetee** : Pi-hole — très populaire et bien documenté, mais stack plus lourde, interface vieillissante, et le DNS chiffré nécessité des composants supplémentaires.

---

## VPN : Tailscale plutôt que WireGuard self-hosted

**Contexte** : Acces distant sécurisé au homelab.

**Decision** : Tailscale

**Pourquoi** :

- Zero configuration réseau (NAT traversal automatique, pas de port forwarding)
- Mesh VPN (tous les devices se voient directement)
- MagicDNS pour la resolution de noms
- Gratuit pour un usage personnel (100 devices)
- Le trafic est chiffré en WireGuard point-a-point (le serveur de coordination ne voit pas le contenu)

**Alternative consideree** : Headscale (Tailscale self-hosted) — rejete car ajoute un SPOF sur le RPi pour un gain de souverainete minimal (le coordination server ne voit pas le trafic).

**Alternative rejetee** : WireGuard bare — plus de contrôle, mais configuration manuelle de chaque peer, gestion des clés, port forwarding sur la box, pas de NAT traversal.

---

## Monitoring : Beszel (metriques) + Grafana/Loki (logs) — complementaires

**Contexte** : Observabilite pour un petit homelab (1-10 hosts).

**Decision** : Beszel pour les metriques, Grafana+Loki pour les logs. **Pas de Prometheus / node_exporter**.

**Pourquoi** :

- Beszel seul couvre 100% des besoins metriques système (CPU, RAM, disk, net, containers) — pas de valeur ajoutee a reinstaller Prometheus + node_exporter.
- Grafana+Loki couvre ce que Beszel ne fait pas : recherche dans les logs applicatifs, events auditd, échecs d'auth, analyse Traefik access logs.
- Les deux outils ont chacun leur dashboard : `monitor.home...` (Beszel) et `logs.home...` (Grafana).
- Sans doublon, chaque outil reste léger.

**Decouplage delibere** : Grafana tourne dans un LXC dedie (`logs` sur lancelot), pas sur penny. Benefice : si penny tombe, on peut analyser les logs depuis l'infra Proxmox; inversement, un crash logs n'affecte pas les services.

**Alternative rejetee** : stack Prometheus+node_exporter+Grafana pour les metriques — redondant avec Beszel, plus lourd, plus complexe a maintenir.

---

## Grafana 100% OIDC — aucun compte admin local

**Contexte** : Grafana livre un compte `admin` par defaut avec mot de passe static. Politique credentials du homelab : **zero compte admin local**, tout via Authelia.

**Decision** :

- `GF_AUTH_DISABLE_LOGIN_FORM=true` + `GF_AUTH_BASIC_ENABLED=false` : impossible de se connecter autrement qu'en OIDC.
- `GF_AUTH_OAUTH_AUTO_LOGIN=true` : redirection directe vers Authelia.
- Rôle mapping : groupe `admins` Authelia → `GrafanaAdmin`.
- Compte legacy `admin` : `is_disabled=1` + password efface en DB SQLite.
- Pas de break-glass dedie : Grafana = service non critique (lecture de logs). Si Authelia tombe, on repasse en mode basic temporairement via edition du compose.

**Pourquoi** : respecter la politique uniformement. Grafana n'est pas un service critique → pas de break-glass.

---

## ZFS encryption at-rest — skip pour le homelab

**Contexte** : la roadmap sécurité listait "chiffrement ZFS at-rest" en P2.

**Decision** : skip.

**Pourquoi** :

- Modèle de menace homelab domicile : risque vol physique faible (cambriolage normal cible cash/electro, pas un ZimaBoard).
- Données vraiment sensibles = Vaultwarden master password — déjà chiffré Argon2id par design.
- Backups B2 déjà chiffrés client-side (restic AES-256).
- ZFS encryption protégé uniquement disque eteint OU saisie/RMA. Pas un attaquant root, pas une compromission réseau.
- Cout : reinstall complète Proxmox en ZFS-on-root + boot non-unattended (passphrase au boot = casse `homelab_monitor.sh`, watchdog auto-recovery, restart via WoL).
- Workaround clef USB physique = fragilise (clef perdue = données perdues).

**A reconsiderer si** : demenagement avec serveurs en transit, ou stockage données client/médical/financier.

**Alternative gain supérieur** : YubiKey FIDO2 SSH (vrai gain — supprimé le risque "clé SSH volee = root immédiat").

---

## Wallos supprimé

**Contexte** : Wallos (tracker d'abonnements) installe initialement, peu utilisé.

**Decision** : Supprimé (container + volumes + routes Traefik + entree Homepage).

**Pourquoi** : surface d'attaque additionnelle pour un usage marginal. Suppression > maintenance.

---

## Security headers : pas de CSP global, per-route headers

**Contexte** : hardening HTTPS via security-headers Traefik middleware (HSTS, X-Frame, Referrer-Policy, Permissions-Policy, CSP, COOP, CORP).

**Decision** : CSP retire du middleware global. Security-headers appliques per-route (Docker labels), PAS au niveau entrypoint.

**Pourquoi** :

- CSP global (`default-src 'self'`) casse les SPA : Beszel (SvelteKit), Proxmox (ExtJS), Portainer (Angular). Chaque framework a des besoins différents (inline scripts, eval, WebSocket `wss:`, data URIs).
- `Cross-Origin-Opener-Policy: same-origin` casse le flow OIDC redirect (popup → Authelia → retour app = opener référence perdue). Fix : `same-origin-allow-popups`.
- TLS 1.3 strict (`minVersion: VersionTLS13`) rollback : tous les clients modernes le supportent mais des interactions subtiles avec sniStrict causaient des timeouts.
- Proxmox ExtJS est particulierement fragile → PVE routes n'ont AUCUN security header Traefik.

**Headers conserves en global** (per-route via Docker labels) : HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

---

## Firewall : Appliance dediee plutôt que VM Proxmox

**Contexte** : Faire tourner OPNsense pour la segmentation VLANs.

**Decision** : Appliance bare-metal dediee (Topton/CWWK N100, 4x 2.5GbE)

**Pourquoi** :

- Pas de SPOF — si un nœud Proxmox tombe, le réseau continue de fonctionner
- Libéré les deux ZimaBoard pour du compute (3 nœuds Proxmox avec quorum)
- 4 ports 2.5GbE natifs (pas de VLAN-on-a-stick)
- ~120€ — investissement raisonnable vu ce que ca debloque

**Alternative rejetee** : OPNsense en VM sur un ZimaBoard — perd un nœud Proxmox, et si ce ZimaBoard tombe, plus de réseau.

---

## Stockage : SSD USB plutôt que boot sur SSD

**Contexte** : Le RPi 4 peut booter sur USB, mais l'Argon ONE M.2 utilisé un bridge USB-SATA.

**Decision** : Boot sur SD Card, données sur SSD

**Pourquoi** :

- Le bridge ASMedia ASM1156 a des problèmes de stabilité (déconnexions PCIe ASPM) — garder l'OS sur la SD card assure que le système boot même si le SSD a un souci
- `nofail` dans fstab — le système démarre sans le SSD
- Les logs en tmpfs protegent la SD card de l'usure
- Docker data-root sur le SSD — les ecritures lourdes vont sur le SSD, pas la SD

**Alternative rejetee** : Boot complet sur SSD — plus rapide au boot, mais si le bridge USB deconnecte, le système entier crash (kernel panic). Trop risque avec ce bridge.

---

## Updates Docker : Watchtower plutôt que WUD

**Contexte** : WUD (What's Up Docker) surveillait les mises a jour images mais exposait une API web anonyme sur le réseau interne (item sécurité P2 ouvert, auth interne cassee).

**Decision** : Migration vers Watchtower (headless)

**Pourquoi** :

- **Zero surface d'attaque** — pas de port, pas d'API, pas de route Traefik. Ferme l'item P2 "WUD auth interne"
- **Auto-update** des services non-critiques (homepage, beszel, beszel-agent, autoheal) — plus de maintenance manuelle
- **Monitor-only** sur les critiques (traefik, authelia, portainer, adguard, socket-proxy) via label `com.centurylinklabs.watchtower.monitor-only=true` — notification ntfy quand nouvelle version dispo
- Plus léger (30 MB vs 357 MB)
- Notification ntfy en mode report : silence si RAS, résumé sinon (maj OK / échec / maintenance requise)
- Cleanup automatique des anciennes images

**Alternative rejetee** : Garder WUD — API interne anonyme non corrigeable (bug confirme), surface d'attaque inutile pour un dashboard peu consulte.

---

## Cluster quorum : qdevice sur penny plutôt que 3e node PVE

**Contexte** : Cluster 2-node perd systematiquement quorum quand un node tombe (confirme incident 2026-04-19 lancelot down ~6h, galahad paralyse même quorate=1/2).

**Decision** : `corosync-qnetd` sur penny (2026-04-19)

**Pourquoi** :

- **Penny est déjà la** — RPi 4 toujours on, Tailscale, firewall, maintenu. Zero materiel nouveau.
- **1 vote arbitraire** — penny ne heberge pas de LXC, juste le vote. Simple a maintenir.
- **30 min déploiement** vs investissement hardware + setup Proxmox sur un 3e machine (~500€ + 1 journee)
- **Pattern officiel Proxmox** : documenté, supporte, `pvecm qdevice setup` built-in
- Survit aux pannes les plus fréquentes (1 node down)

**Alternative rejetee** : Attendre le Minisforum N5 Max (phase 4 roadmap) — trop d'attente vu l'incident recurrent. qdevice est une étape intermediate qui peut rester même après le 3e node.

**Tradeoff** : penny devient indirectement critique pour les opérations cluster (pas juste pour ses services). Si penny + 1 node PVE tombent simultanement = 1/3 vote = perte quorum. Double-fault extrême, acceptable.

---

## Docker log-driver : json-file plutôt que journald (ARM)

**Contexte** : Sur ARM (penny RPi 4), dockerd crash SIGBUS dans le reader `sdjournal` quand journald rotate les files. 5 restarts docker en 24h le 2026-04-19, containers massivement down.

**Decision** : log-driver `json-file` + rotation `max-size=10m max-file=3` (2026-04-19)

**Pourquoi** :

- **Battle-tested** — default Docker, pas de cgo fragile (sdjournal utilisé libsystemd via cgo, crash SIGBUS sur read mmap pendant rotation)
- **Rotation builtin** — max-size/max-file évite le bloat disque (sans ca, json-file accumule indefiniment)
- **Compatible shipping Loki** — Alloy a `loki.source.docker` qui lit via socket API (pas via journald), fonctionne idem
- **Bug ARM-specific** — Pi rotate agressivement journald (SystemMaxUse serre), x86 moins impacte

**Alternative rejetee** : Downgrade Docker ou journald SystemMaxUse=... — workarounds fragiles, bug reapparait au prochain update Docker. json-file éliminé categoriquement la classe de crash.

**Impact** : `journalctl CONTAINER_NAME=X` ne marche plus (logs pas dans journald). `docker logs X` continue de marcher. Shipping Loki via Alloy continue.

---

## Alloy HA : dual-write primary + replica au lieu de single Loki

**Contexte** : Loki tourne dans LXC 101 sur lancelot. Si lancelot tombe, observabilite perdue pendant la panne (alors que c'est justement quand on en a le plus besoin).

**Decision** : dual-write depuis les 3 hosts vers Loki primary (lancelot:3100) + replica (penny:3101) (2026-04-19)

**Pourquoi** :

- **Replica etait déjà en place** pour penny (dual-write existant depuis deploy) — etendre aux 2 nodes PVE = 5 min config Alloy par node
- **Survit a lancelot down** — Grafana depuis loki-replica via URL alternative
- **WAL Alloy** — chaque Alloy buffer localement si un sink est down, rejoue au retour. Zero perte.
- **Cout quasi-nul** — même images Docker, même storage (replica dans container sur penny SSD)

**Alternative rejetee** : Loki cluster-mode (microservices) — overkill pour 3 hosts, complexite opérationnelle >> gain résilience.

---

## Secrets at-rest : sops + age + tmpfs plutôt que Vault / Bitwarden CLI

**Contexte** : Secrets Authelia (JWT, OIDC keys) et CrowdSec credentials etaient en clair dans le repo `homelab-config` (sur Github prive mais toujours exposé a qui volerait le token). Besoin : chiffrement at-rest, déchiffrement automatique au boot.

**Decision** : `sops` + age + scellement in-place + unseal vers tmpfs `/run/homelab/` au boot (systemd unit) (2026-04-17 → 2026-04-19 finalise)

**Pourquoi** :

- **Git-friendly** — sops chiffré au niveau champ YAML, diff lisible, pas de blob opaque
- **age** — clé moderne (X25519), plus simple que GPG, supporte YubiKey (`age-plugin-yubikey`) pour DR physique
- **tmpfs** — secrets déchiffrés jamais sur disque, efface au shutdown. Le service Docker bind-mount la tmpfs dans le container (RO pour authelia, RW pour crowdsec car entrypoint reecrit)
- **Boot-time** — `homelab-unseal.service` systemd fait le déchiffrement, puis `docker.service` démarre (dépendance ordre)
- **Fail-safe** — si unseal échoué, Docker démarre mais les bind-mounts pointent vers des fichiers inexistants → containers cassent en erreur explicite (vs demarrent avec secrets vides = drift silencieux)

**Alternative rejetee** :
- Vault — agent overhead, complexite d'opération pour 5 secrets, pas git-native
- Bitwarden CLI — plaintext au moment du fetch, dépendance runtime au vault Vaultwarden (circulaire : vault backup contient ses propres secrets)

**Piege documenté** : CrowdSec credentials doivent être bind-mount `:rw` (entrypoint reecrit au boot). Le fichier `console.yaml` n'est pas scelle (booleans sans secret, pas de bind-mount tmpfs dans compose).

---

## Cloud offsite backups : Cloudflare R2 plutot que Backblaze B2

**Contexte** : Restic + rclone PBS sync vers B2 a atteint **deux caps simultanement** le 2026-05-11 (Storage Cap + Class B/C Transaction Cap). Le second a cascade depuis le premier : les scripts en retry boucle chaque minute ont bombarde l'API B2 jusqu'au transaction cap exceeded → meme l'auth a renvoye 403. **5+ pipelines** backup fail en chaine, dont l'auth itself plus possible.

**Decision** : Migrer vers Cloudflare R2 EU (2026-05-11). `s3:https://<account-id>.eu.r2.cloudflarestorage.com/homelab-backups/<repo>`.

**Pourquoi** :

- **Pas de cap journalier** sur R2 free tier. Le mode panique B2 (transaction cap cascade) ne peut plus arriver.
- **1M Class A writes + 10M Class B reads par MOIS** gratuit (vs B2 journaliers durs, ~3-5k transactions/jour = scripts retry hammering les depasse trivialement).
- **0 egress fee** illimite. B2 facturait l'egress au-dela du free tier (10 GB/mois). R2 = telechargement gratuit, important pour les drills DR.
- **API S3-compatible standard** — restic `s3:` backend natif, rclone `type=s3 provider=Cloudflare`. Pas de specificite B2 a apprendre.
- **EU jurisdiction** — bucket physiquement en EU, coherent avec stack Proton/privacy.

**Alternative rejetee** :

- **Augmenter les caps B2** — coute en transactions illimite ($0.01 par 10k Class C, par exemple). R2 etait gratuit pour ce niveau d'usage. Et le risque de cap cascade demeurait.
- **Self-host offsite** (autre Pi chez un pote) — depend de la confiance + maintenance reciproque. Pas pret pour cette charge sociale.
- **Proton Drive via rclone** — backend rclone `protondrive` experimental. 500 GB inclus dans Proton Unlimited mais latence et fragilite vs R2.
- **Reduire le footprint pour rester sous B2 free tier** — aurait fonctionne mais marge tres faible, risque cap retour rapide a chaque nouveau repo.

**Piege documente** : R2 Object Read/Write tokens **denient l'operation `HeadBucket`**. rclone fait HeadBucket preflight par defaut → 403 AccessDenied. **Fix** : ajouter `no_check_bucket = true` dans la config `[r2]` du `rclone.conf`. Restic n'est pas affecte (utilise pas HeadBucket).

**Piege documente 2** : Les R2 buckets EU jurisdiction utilisent l'endpoint `<account-id>.eu.r2.cloudflarestorage.com` (pas le default `<account-id>.r2.cloudflarestorage.com`). Le script `migrate-restic-r2.sh` prompte la juridiction (default/eu/fedramp) pour construire le bon endpoint.

---

## SMTP outbound : Postfix relay via Proton submission plutot que direct port 25

**Contexte** : `vzdump` sur PVE nodes + cron alerts emettaient via postfix direct port 25 outbound vers smtp.gmail.com. ISP Free **bloque souvent le port 25 outbound** (anti-spam). Resultat : mails coinces en queue depuis longtemps, jamais delivres. Plus, le port 25 outbound est **l'exception fragile** de la Phase 2 egress firewall (whitelist requise sur PVE nodes).

**Decision** : Postfix relay via `smtp.protonmail.ch:587` avec auth SMTP submission token Proton (2026-05-11). Port 25 outbound retire de l'egress whitelist PVE.

**Pourquoi** :

- **Proton SMTP submission** disponible sur Proton Mail Plus / Unlimited / Business (l'user a Unlimited 500 GB). Token regenerable, scoped, revocable.
- **Port 587 STARTTLS** — submission standard, auth obligatoire, traversee NAT sans deblocage ISP requise.
- **`sender_canonical` rewrite** — Proton refuse si MAIL FROM / From: header ne match pas le user authentifie. Rewrite regexp `/.* / homelab@gabin-simond.fr` couvre tous les expediteurs locaux.
- **Cluster-wide config** identique sur galahad + lancelot, deploye via script `setup-postfix-relay.sh` (idempotent : install libsasl2-modules, disable chroot smtp unix service, deploy sasl_passwd + sender_canonical, postfix reload).
- **Plus de spam-relay risk** si un container PVE compromis : il devra passer par l'auth submission Proton, refusee sans le token.

**Alternative rejetee** :

- **Garder port 25 + Gmail SMTP relay free tier** — Gmail relay 2000 mails/jour gratuit, mais l'user prefere Proton (coherent privacy stance, Unlimited deja paye).
- **Self-host MX + reverse DNS** — IP residentielle, ISP bloque port 25, pas de PTR record dispo, mail finirait en spam des grands MTA.
- **Brevo / Mailgun / Resend transactionnel** — gratuit mais ajoute un service externe a maintenir alors que Proton est deja en place et fonctionne.

**Pieges documentes** : (1) **`libsasl2-modules` manquant** sur Debian default → "No worthy mechs found" sur PLAIN/LOGIN auth requis par Proton ; (2) **chroot par defaut sur smtp unix service** dans master.cf → postfix chroot ne voit pas `/usr/lib/.../sasl2/` du host → SASL fail meme avec le package installe. Le deploy script handle les deux.

---

## Journald penny : volatile (RAM) plutôt que persistant sous /var/log/journal

**Contexte** : penny tourne DietPi en mode RAMlog (`AUTO_SETUP_LOGGING_INDEX=-1`). Le journald persistant avait ete active (`Storage=persistent`, `/var/log/journal` sur le SSD) pour garder des logs locaux post-reboot. Mais `dietpi-logclear` (cron.hourly a :17) fait `find /var/log -type f | truncate -cs0` et descend dans le mount `/var/log/journal` → tronque le `system.journal` ACTIF a 0 octet chaque heure. Le fichier etant mmap'd par Alloy (`loki.source.journal` → `sd_journal_next`), la troncature → **SIGBUS → alloy.service crashe a chaque :17**. Effet de bord : retention reelle ~1h seulement.

**Decision** : `Storage=volatile` (journal en RAM `/run/log/journal`) + Alloy pin `path = "/run/log/journal"` (2026-06-25)

**Pourquoi** :

- **Supprime le conflit a la racine** — `/run/log/journal` est hors du perimetre de `dietpi-logclear` (qui ne touche que `/var/log`). Plus de troncature, plus de SIGBUS. Prouve en relancant `dietpi-logclear` a la main : Alloy meme PID, NRestarts=0.
- **`path` pinned indispensable** — sans lui, `sd-journal` lit AUSSI les fichiers residuels `/var/log/journal` que `dietpi-logclear` tronque encore → SIGBUS persiste.
- **Aligne avec la philosophie RAMlog** — DietPi mode -1 veut des logs ephemeres en RAM ; Loki est la couche de retention.
- **Moins d'ecritures SSD** — fini la rotation/troncature horaire du journal sur le SSD.

**Alternative rejetee** : (1) **DietPi mode -3 (rsyslog+logrotate)** — persistance disque reelle mais installe rsyslog + /var/log passe tmpfs→disque, plus gros blast radius. (2) **Exclure /var/log/journal de dietpi-logclear** — necessite d'editer un fichier gere par DietPi, fragile (reecrit aux updates).

**Impact** : plus de journal local persistant apres reboot (l'historique central reste dans Loki). Fichiers `/var/log/journal/*` desormais vestigiaux. Lecon : sur DietPi RAMlog, ne jamais poser le journald persistant sous `/var/log/journal`.
