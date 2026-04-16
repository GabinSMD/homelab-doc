# Hardening

Ce document centralise toutes les mesures de durcissement appliquees, par couche, avec commandes reproductibles.

Pour la doctrine generale (modele de menace, politique credentials), voir [politique.md](politique.md).

Pour la roadmap des actions restantes, voir [roadmap.md](roadmap.md).

---

## Scores Lynis

| Machine | Score | Date | Δ | Notes |
|---|---|---|---|---|
| penny | **77/100** | 2026-04-13 (re-run) | +1 | Debian 12 / DietPi / RPi4 — kptr_restrict + read_only Beszel/Watchtower |
| galahad | **68/100** | 2026-04-13 (re-run) | 0 | Debian 13 / Proxmox 9 |
| lancelot | **70/100** | 2026-04-13 (re-run) | +1 | Debian 13 / Proxmox 9 — auditd reactive |

Lynis weekly cron : dimanche 5h, push ntfy avec priorite variable selon le score.

### Suggestions Lynis restantes (commun aux 3 hosts)

Quick wins non encore appliques (chacun gagne 1-3 points) :

| ID | Action | Hosts |
|---|---|---|
| DEB-0810 | `apt install apt-listbugs` | tous |
| DEB-0280 | `apt install libpam-tmpdir` | galahad |
| DEB-0831 | `apt install needrestart` | galahad |
| AUTH-9262 | `apt install libpam-passwdqc` (PAM password strength) | tous |
| AUTH-9286 | `PASS_MIN_DAYS 1`, `PASS_MAX_DAYS 365`, `PASS_WARN_AGE 14` dans `/etc/login.defs` | tous |
| AUTH-9230 | `ENCRYPT_METHOD YESCRYPT` + `SHA_CRYPT_MIN_ROUNDS 65536` dans `/etc/login.defs` | tous |
| AUTH-9328 | `UMASK 027` dans `/etc/login.defs` | tous |
| BOOT-5122 | Mot de passe GRUB (plus invasif, peut bloquer reboot a distance) | galahad+lancelot |
| BOOT-5264 | `systemd-analyze security` par service, hardening systemd-units | galahad+lancelot |
| KRNL-5788 | symlink `/vmlinuz` (cosmetique) | galahad+lancelot |

---

## penny (RPi 4 / DietPi)

### Surface d'attaque reduite

| Mesure | Implementation |
|---|---|
| WiFi desactive | `dtoverlay=disable-wifi` dans `config.txt` |
| Bluetooth desactive | Stack BT non installee |
| HDMI desactive | `hdmi_ignore_hotplug=1`, `max_framebuffers=0` |
| Audio desactive | `dtparam=audio=off` |
| GPU minimal | 16 Mo (au lieu des 64 par defaut) |

### SSH (`/etc/ssh/sshd_config`)

```ini
Port 2806
PermitRootLogin no
PasswordAuthentication no
MaxAuthTries 3
# Post-Lynis:
AllowTcpForwarding no
ClientAliveCountMax 2
Compression no
LogLevel VERBOSE
MaxSessions 2
TCPKeepAlive no
UseDNS no
X11Forwarding no
```

!!! note "dietpi.conf override"
    Sur penny (DietPi), `PermitRootLogin no` et `PasswordAuthentication no` doivent etre aussi dans `/etc/ssh/sshd_config.d/dietpi.conf` car DietPi override les defaults au reboot.

### Firewall iptables

Policy `INPUT DROP`. Ports ouverts uniquement :

| Port | Service | Scope |
|---|---|---|
| 53 (TCP/UDP) | AdGuard DNS | Tous |
| 80, 443 | Traefik HTTPS | Tous |
| 853 | DNS-over-TLS | Tous |
| 2806 | SSH | Tous (cle requise) |
| 3000 | AdGuard web UI | LAN + Tailscale |
| 2049 (TCP) | NFS (PBS datastore) | LAN + Tailscale |
| 111 (TCP/UDP) | rpcbind / portmapper (NFS) | LAN + Tailscale |
| 45876 | Beszel agent | LAN + Tailscale |

Persistance via `netfilter-persistent`.

### sysctl hardening (`/etc/sysctl.d/99-hardening.conf`)

```ini
# Network
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1

# TCP
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2

# ICMP
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
```

### login.defs + umask

```ini
UMASK 027
SHA_CRYPT_MIN_ROUNDS 500000
SHA_CRYPT_MAX_ROUNDS 500000
```

### Core dumps desactives (`/etc/security/limits.d/disable-core.conf`)

```
* hard core 0
* soft core 0
```

### Modules kernel bloques (`/etc/modprobe.d/`)

```
blacklist firewire-core
blacklist firewire-ohci
blacklist dccp
blacklist sctp
blacklist rds
blacklist tipc
```

### Watchdog hardware

Voir [os.md](../architecture/os.md#watchdog-hardware-bcm2835) pour la configuration complete. Timeout 15s, module `bcm2835_wdt`.

### Comptes

- `root` : mot de passe fort (vault), SSH disabled
- `gabins` : uid 1002, sudo NOPASSWD, cle SSH
- `sguardian`, `smanager` (legacy DietPi) : `nologin + locked`

### fail2ban

Jail `sshd` sur port 2806, 3 tentatives, ban 1h. Ignore LAN + Tailscale (`127.0.0.1/8`, `192.168.1.0/24`, `100.64.0.0/10`). Backend systemd.

### auditd

Rules dans `/etc/audit/rules.d/homelab.rules` :
- Auth events (`/etc/passwd`, `/etc/shadow`, `/etc/sudoers`)
- SSH config changes
- Root exec calls
- Kernel modules (insmod/rmmod)
- Crontabs
- Firewall + sysctl
- Docker config + socket

### unattended-upgrades

Actif, reboot auto a 4h si necessaire (apres backups 3h). Upgrades securite Debian uniquement.

### Docker daemon

Voir [os.md](../architecture/os.md#daemonjson) pour la configuration complete. Points securite : `icc: false` (inter-container OFF), `no-new-privileges: true`.

---

## galahad + lancelot (Proxmox 9 / Trixie)

### SSH

Idem penny mais :
- Port 2807 (galahad) / 2808 (lancelot)
- `PermitRootLogin prohibit-password` (Proxmox necessite root pour operations cluster : pvecm, corosync)
- `PasswordAuthentication no`

### Firewall Proxmox cluster (`/etc/pve/firewall/cluster.fw`)

```ini
[OPTIONS]
enable: 1
policy_in: DROP
policy_out: ACCEPT

[RULES]
IN ACCEPT -p icmp -log nolog
IN ACCEPT -p tcp -dport 8006 -source 192.168.1.0/24 -log nolog
IN ACCEPT -p tcp -dport 8006 -source 100.64.0.0/10 -log nolog
IN ACCEPT -p tcp -dport 2807 -log nolog
IN ACCEPT -p tcp -dport 2808 -log nolog
IN ACCEPT -source 192.168.1.0/24 -p tcp -dport 3128 -log nolog
IN ACCEPT -i tailscale0 -log nolog
```

### Services actifs

| Service | galahad | lancelot |
|---|---|---|
| fail2ban | Actif (SSH + Proxmox jails) | Actif (SSH + Proxmox jails) |
| unattended-upgrades | Actif | Actif |
| auditd | Actif | Actif (reactive 2026-04-13 — retrait des watch Docker absents host) |
| lynis weekly | Cron dimanche 5h | Cron dimanche 5h |
| rpcbind | Disabled + masked | Disabled + masked |

---

## LXC (100, 101, 102, 103)

### SSH

Tous les LXC ont le meme hardening SSH :

```ini
PermitRootLogin no
PasswordAuthentication no
```

Acces root dans les LXC : `pct enter <VMID>` depuis l'hyperviseur (pas besoin de SSH root). SSH direct via `gabins` + cle Ed25519 si necessaire pour les scripts (monitoring, backup).

---

## Reseaux Docker — isolation et ICC

| Reseau | Type | ICC | Containers | Note |
|---|---|---|---|---|
| `proxy` | bridge | enabled | traefik, authelia, portainer, homepage, wud, beszel | ICC enabled by design pour Traefik -> backends. **Implication** : tout container compromis sur ce reseau peut joindre les autres en HTTP interne (ex: homepage -> wud:3001 anonyme, traefik:8080 admin API). |
| `socket` | bridge `internal: true` | enabled | socket-proxy, traefik, homepage, wud, autoheal | Pas d'acces internet. ICC limite a la API socket-proxy whitelistee. |
| `host` | host | N/A | adguard, beszel-agent, tailscale | Stack reseau de l'host |

### Mitigations en place

| Vecteur | Mitigation |
|---|---|
| Acces externe (Internet/LAN) sur services backend | Tous via Traefik HTTPS + Authelia (ForwardAuth ou OIDC) |
| Acces interne ancien WUD | Resolu — WUD remplace par Watchtower (headless, pas d'API/UI). |
| Container compromis -> Docker API | socket-proxy whitelistee (CONTAINERS/NETWORKS/EVENTS/IMAGES, pas EXEC/SECRETS/VOLUMES) |
| Container compromis -> Authelia internals | Sessions chiffrees + storage encryption_key |

### A faire (P2)

- ICC=false sur reseau `proxy` : casserait Traefik routing -> necessite split en sous-reseaux (1 par backend, partage avec Traefik).

---

## Docker (tous containers)

### Global (`daemon.json`)

- `no-new-privileges: true`
- `icc: false` (inter-container communication OFF sur bridge par defaut)

### Socket proxy

`tecnativa/docker-socket-proxy` sur reseau `socket` (internal, pas d'internet). Whitelist :
- `CONTAINERS`, `NETWORKS`, `SERVICES`, `TASKS`, `EVENTS`, `IMAGES`, `INFO`, `VERSION`, `PING`
- `POST: 1` (pour autoheal)
- Bloque : `EXEC`, `SECRETS`, `BUILD`, `VOLUMES`, `CONFIGS`, `SWARM`, `NODES`, `AUTH`, `SYSTEM`

Clients socket-proxy : Traefik, Homepage, Watchtower, autoheal.

Clients socket direct : **Portainer uniquement** (admin tool necessite acces complet).

### Per-container (`cap_drop` + `cap_add`)

| Container | cap_drop | cap_add |
|---|---|---|
| Vaultwarden | ALL | `NET_BIND_SERVICE`, `CHOWN`, `DAC_OVERRIDE`, `SETGID`, `SETUID` |
| Authelia | ALL | `SETGID`, `SETUID`, `DAC_OVERRIDE` |
| Traefik | ALL | `NET_BIND_SERVICE` |
| Homepage | ALL | (aucune, read-only) |
| Beszel | ALL | (aucune) |
| Watchtower | ALL | (aucune) |
| socket-proxy | ALL (par design) | (gere par le proxy) |
| AdGuard | non applicable | DHCP + host network necessite plus |
| Portainer | non applicable | admin tool |

### read_only (rootfs immuable)

| Container | read_only | Tmpfs | Note |
|---|---|---|---|
| Traefik | ✅ OK | `/tmp`, `/run` | teste 2026-04-13 |
| Homepage | ✅ OK | `/tmp`, `/app/.next/cache` | teste 2026-04-13 |
| Authelia | ❌ KO | — | ecrit `/app/.healthcheck.env` au startup (pas seulement healthcheck), impossible en l'etat |
| Vaultwarden | ❌ KO | — | SQLite DB + icons cache (design) |
| Beszel, Watchtower | ⚠️ non teste | — | candidats potentiels |

### Ports directs supprimes

Tous les services passent par Traefik HTTPS (443) + Authelia ForwardAuth. Ports directs **supprimes** :
- Portainer : 8000, 9443
- Homepage : 3100
- Watchtower : pas de port (headless)
- Beszel : 8090
- Traefik dashboard : 8080 (accessible uniquement via reseau `socket` pour healthcheck)

### Healthchecks

Tous les services accessibles ont un healthcheck (wget/curl). Autoheal restart les containers `unhealthy` apres 3 echecs consecutifs.

---

## Voir aussi

- [Authelia (SSO)](../services/authelia.md) — configuration SSO, clients OIDC, secrets rotation
- [Traefik](../services/traefik.md) — middlewares, TLS, reverse proxy
- [Backups](../operations/backups.md) — architecture, retention, restauration
- [Tailscale ACLs](../architecture/reseau.md) — VPN mesh, key expiry, ACL policy

---

## Verification rapide

Check complet en une commande :

```bash
# Sur chaque host
echo "=== $(hostname) ==="
echo "SSH: $(systemctl is-active sshd)"
echo "fail2ban: $(systemctl is-active fail2ban 2>/dev/null)"
echo "auditd: $(systemctl is-active auditd 2>/dev/null)"
echo "Lynis score: $(grep -oP '^hardening_index=\K[0-9]+' /var/log/lynis-report.dat 2>/dev/null)"
echo "Firewall: $(iptables -L INPUT 2>/dev/null | grep -oP 'policy \K\w+' || pve-firewall status 2>&1 | grep -oP 'Status: \K\S+')"
```
