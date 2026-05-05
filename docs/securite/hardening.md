# Hardening

Ce document centralise toutes les mesures de durcissement appliquees, par couche, avec commandes reproductibles.

Pour la doctrine générale (modèle de menace, politique credentials), voir [politique.md](politique.md).

Pour la roadmap des actions restantes, voir [roadmap.md](roadmap.md).

---

## Scores Lynis

| Machine | Score | Date | Δ | Notes |
|---|---|---|---|---|
| penny | **77/100** | 2026-04-13 (re-run) | +1 | Debian 12 / DietPi / RPi4 — kptr_restrict + read_only Beszel/Watchtower |
| galahad | **68/100** | 2026-04-13 (re-run) | 0 | Debian 13 / Proxmox 9 |
| lancelot | **70/100** | 2026-04-13 (re-run) | +1 | Debian 13 / Proxmox 9 — auditd reactive |

Lynis weekly cron : dimanche 5h, push ntfy avec priorité variable selon le score.

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

### Surface d'attaque réduite

| Mesure | Implementation |
|---|---|
| WiFi désactivé | `dtoverlay=disable-wifi` dans `config.txt` |
| Bluetooth désactivé | Stack BT non installee |
| HDMI désactivé | `hdmi_ignore_hotplug=1`, `max_framebuffers=0` |
| Audio désactivé | `dtparam=audio=off` |
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
    Sur penny (DietPi), `PermitRootLogin no` et `PasswordAuthentication no` doivent être aussi dans `/etc/ssh/sshd_config.d/dietpi.conf` car DietPi override les defaults au reboot.

### Firewall iptables

Policy `INPUT DROP`. Ports ouverts uniquement :

| Port | Service | Scope |
|---|---|---|
| 53 (TCP/UDP) | AdGuard DNS | Tous |
| 80, 443 | Traefik HTTPS | Tous |
| 853 | DNS-over-TLS | Tous |
| 2806 | SSH | Tous (clé requise) |
| 3000 | AdGuard web UI | LAN + Tailscale |
| 2049 (TCP) | NFS (PBS datastore) | LAN + Tailscale |
| 111 (TCP/UDP) | rpcbind / portmapper (NFS) | LAN + Tailscale |
| 45876 | Beszel agent | LAN + Tailscale |
| 5403 (TCP) | corosync-qnetd (qdevice) | LAN + Tailscale |
| 3101 (TCP) | loki-replica (HA Loki) | LAN (via Docker bridge, interne) |

Persistance via `netfilter-persistent`.

---

## Systemd drop-ins : PrivateMounts=yes (anti-leak namespace)

**Contexte** : tout service systemd avec `ProtectSystem=strict|full` ou `ProtectKernelModules=yes` et sans `PrivateMounts=yes` leak ses bind-mounts RO (namespace shared par defaut) vers le mount tree host global. Résultat : `/etc`, `/usr`, `/boot` deviennent RO pour toutes les sessions — `apt install` casse, `pct set` casse, etc.

Fix systematique : drop-in `PrivateMounts=yes` sur chaque service hardene.

### Services concernes (identifies 2026-04-19)

| Host | Services avec drop-in `PrivateMounts=yes` |
|------|-------------------------------------------|
| penny | ssh, fail2ban, systemd-networkd, systemd-timesyncd, auditd, fstrim, systemd-hostnamed, systemd-localed, systemd-logind, systemd-timedated (10 services) |
| galahad | ssh, fail2ban, postfix, chrony, beszel-agent, systemd-logind (6 services) |
| lancelot | idem galahad |

### Pattern drop-in

```bash
mkdir -p /etc/systemd/system/<svc>.service.d
cat > /etc/systemd/system/<svc>.service.d/private-mounts.conf <<EOF
[Service]
PrivateMounts=yes
EOF
systemctl daemon-reload
systemctl restart <svc>
```

### Scan détection

Pour trouver un service leaky sur un host :

```bash
for svc in $(systemctl list-units --type=service --state=active --no-legend | awk '{print $1}'); do
  ps=$(systemctl show "$svc" -p ProtectSystem --value)
  pm=$(systemctl show "$svc" -p PrivateMounts --value)
  if [ "$ps" = "strict" ] || [ "$ps" = "full" ]; then
    [ "$pm" != "yes" ] && echo "LEAK: $svc (PS=$ps PM=$pm)"
  fi
done
```

### Vérification mount state

```bash
findmnt /etc /usr /boot 2>&1
# Doit ne rien renvoyer (aucun bind-mount RO separe)
touch /etc/.testwrite && rm /etc/.testwrite && echo OK
```

Voir `operations/depannage.md` section "/etc, /usr, /boot read-only" pour remediation si re-apparaît.

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

```text
* hard core 0
* soft core 0
```

### Modules kernel bloques (`/etc/modprobe.d/`)

```text
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
- `gabins` : uid 1002, sudo NOPASSWD, clé SSH
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

Actif, reboot auto a 4h si nécessaire (après backups 3h). Upgrades sécurité Debian uniquement.

### Docker daemon

Voir [os.md](../architecture/os.md#daemonjson) pour la configuration complete. Points sécurité : `icc: false` (inter-container OFF), `no-new-privileges: true`.

---

## galahad + lancelot (Proxmox 9 / Trixie)

### SSH

Idem penny mais :
- Port 2807 (galahad) / 2808 (lancelot)
- `PermitRootLogin prohibit-password` (Proxmox nécessité root pour opérations cluster : pvecm, corosync)
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

Tous les LXC ont le même hardening SSH :

```ini
PermitRootLogin no
PasswordAuthentication no
```

Acces root dans les LXC : `pct enter <VMID>` depuis l'hyperviseur (pas besoin de SSH root). SSH direct via `gabins` + clé Ed25519 si nécessaire pour les scripts (monitoring, backup).

---

## Réseaux Docker — isolation et ICC

| Réseau | Type | ICC | Containers | Note |
|---|---|---|---|---|
| `proxy` | bridge | enabled | traefik, authelia, portainer, homepage, wud, beszel | ICC enabled by design pour Traefik -> backends. **Implication** : tout container compromis sur ce réseau peut joindre les autres en HTTP interne (ex: homepage -> wud:3001 anonyme, traefik:8080 admin API). |
| `socket` | bridge `internal: true` | enabled | socket-proxy, traefik, homepage, wud, autoheal | Pas d'acces internet. ICC limité a la API socket-proxy whitelistee. |
| `host` | host | N/A | adguard, beszel-agent, tailscale | Stack réseau de l'host |

### Mitigations en place

| Vecteur | Mitigation |
|---|---|
| Acces externe (Internet/LAN) sur services backend | Tous via Traefik HTTPS + Authelia (ForwardAuth ou OIDC) |
| Acces interne ancien WUD | Resolu — WUD remplacé par Watchtower (headless, pas d'API/UI). |
| Container compromis -> Docker API | socket-proxy whitelistee (CONTAINERS/NETWORKS/EVENTS/IMAGES, pas EXEC/SECRETS/VOLUMES) |
| Container compromis -> Authelia internals | Sessions chiffrees + storage encryption_key |

### A faire (P2)

- ICC=false sur réseau `proxy` : casserait Traefik routing -> nécessité split en sous-réseaux (1 par backend, partagé avec Traefik).

---

## Docker (tous containers)

### Global (`daemon.json`)

- `no-new-privileges: true`
- `icc: false` (inter-container communication OFF sur bridge par defaut)

### Socket proxy

`tecnativa/docker-socket-proxy` sur réseau `socket` (internal, pas d'internet). Whitelist :
- `CONTAINERS`, `NETWORKS`, `SERVICES`, `TASKS`, `EVENTS`, `IMAGES`, `INFO`, `VERSION`, `PING`
- `POST: 1` (pour autoheal)
- Bloque : `EXEC`, `SECRETS`, `BUILD`, `VOLUMES`, `CONFIGS`, `SWARM`, `NODES`, `AUTH`, `SYSTEM`

Clients socket-proxy : Traefik, Homepage, Watchtower, autoheal.

Clients socket direct : **Portainer uniquement** (admin tool nécessité acces complet).

### Per-container (`cap_drop` + `cap_add`)

| Container | cap_drop | cap_add |
|---|---|---|
| Vaultwarden | ALL | `NET_BIND_SERVICE`, `CHOWN`, `DAC_OVERRIDE`, `SETGID`, `SETUID` |
| Authelia | ALL | `SETGID`, `SETUID`, `DAC_OVERRIDE` |
| Traefik | ALL | `NET_BIND_SERVICE` |
| Homepage | ALL | (aucune, read-only) |
| Beszel | ALL | (aucune) |
| Watchtower | ALL | (aucune) |
| socket-proxy | ALL (par design) | (géré par le proxy) |
| AdGuard | non applicable | DHCP + host network nécessité plus |
| Portainer | non applicable | admin tool |

### read_only (rootfs immuable)

| Container | read_only | Tmpfs | Note |
|---|---|---|---|
| Traefik | ✅ OK | `/tmp`, `/run` | teste 2026-04-13 |
| Homepage | ✅ OK | `/tmp`, `/app/.next/cache` | teste 2026-04-13 |
| Authelia | ❌ KO | — | ecrit `/app/.healthcheck.env` au startup (pas seulement healthcheck), impossible en l'état |
| Vaultwarden | ❌ KO | — | SQLite DB + icons cache (design) |
| Beszel, Watchtower | ⚠️ non teste | — | candidats potentiels |

### Ports directs supprimes

Tous les services passent par Traefik HTTPS (443) + Authelia ForwardAuth. Ports directs **supprimes** :
- Portainer : 8000, 9443
- Homepage : 3100
- Watchtower : pas de port (headless)
- Beszel : 8090
- Traefik dashboard : 8080 (accessible uniquement via réseau `socket` pour healthcheck)

### Healthchecks

Tous les services accessibles ont un healthcheck (wget/curl). Autoheal restart les containers `unhealthy` après 3 échecs consecutifs.

---

## Voir aussi

- [Authelia (SSO)](../services/authelia.md) — configuration SSO, clients OIDC, secrets rotation
- [Traefik](../services/traefik.md) — middlewares, TLS, reverse proxy
- [Backups](../operations/backups.md) — architecture, retention, restauration
- [Tailscale ACLs](../architecture/reseau.md) — VPN mesh, key expiry, ACL policy

---

## Vérification rapide

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
