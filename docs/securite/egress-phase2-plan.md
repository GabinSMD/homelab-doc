# Egress firewall phase 2 — plan d'activation

**État au 2026-04-19** (preparation). Phase 1 audit en place depuis 14/04.

## Résumé phase 1

`/root/egress-audit.sh` a installé des règles iptables LOG sur OUTPUT (host) et DOCKER-USER (containers), rate-limit 10/min, skip LAN + Tailscale + Docker bridges. Le but : collecter toutes les destinations externes légitimes avant de passer `OUTPUT DROP`.

### Couverture (gap)

| Host | HOST entries | DOCKER entries |
|------|--------------|----------------|
| penny | 206 | 56 |
| galahad | 0 | 0 |
| lancelot | 0 | 0 |

**⚠ Gap** : galahad + lancelot n'ont **pas** `egress-audit.sh` deployé. Leurs logs sont vides. **Action requise avant phase 2** : déployer le script sur les 2 nodes PVE + attendre 48-72h de collecte.

## Destinations observées sur penny (5 jours)

### Classification par service

| Dest IP | Port | Hits | Service identifié |
|---------|------|------|-------------------|
| 199.165.136.101 | 443 TCP | 69 | Backblaze B2 (restic backup) |
| 160.79.104.10 | 443 TCP | 66 | ntfy.sh (notifications) |
| 13.39.208.199 | 443 TCP | 22 | AWS eu-west-3 (ntfy backend ou similaire) |
| 104.16.248.249 | 443 TCP | 22 | Cloudflare (CDN, API, GitHub LFS) |
| 176.58.90.104 | 443 TCP | 12 | **Tailscale DERP** `derp18d.tailscale.com` (fallback sur TCP si UDP bloqué) |
| 172.66.154.109 | 443 TCP | 12 | Cloudflare |
| 185.40.234.77 | 3478 UDP | 10 | **Tailscale STUN** `derp4h.tailscale.com` |
| 1.1.1.1 | 53 TCP | 10 | Cloudflare DNS (upstream AdGuard) |
| 140.82.121.6 | 443 TCP | 8 | GitHub (`lb-140-82-121-6-fra.github.com`) |
| 13.249.228.33 | 443 TCP | 8 | CloudFront Paris (update services) |
| 34.149.66.137 | 443 TCP | 6 | Google (GCP — peut être googleusercontent, docker hub backed) |
| 52.48.169.214 | 443 TCP | 5 | AWS eu-west-1 |
| 176.58.93.154 | 3478 UDP | 4 | Tailscale STUN `derp14d.tailscale.com` |
| 162.159.200.123 | 123 UDP | 1 | `time.cloudflare.com` (NTP) |
| 192.0.0.6 | 41641 UDP | 2 | Tailscale node direct (peer P2P) |

### Catégories à whitelist (phase 2)

1. **DNS upstream** : `1.1.1.1`, `1.0.0.1`, `9.9.9.9`, `149.112.112.112` — ports 53 TCP/UDP, 443 TCP (DoH), 853 TCP (DoT)
2. **NTP** : `time.cloudflare.com`, `pool.ntp.org` — port 123 UDP
3. **Tailscale** :
   - DERP servers `*.tailscale.com` ports 443 TCP + 3478 UDP (pool d'IPs rotatif — utiliser ipset maintenu via curl https://login.tailscale.com/derpmap/default)
   - Control plane `login.tailscale.com` port 443 TCP
   - P2P peers UDP 41641 vers n'importe quelle IP (négo STUN)
4. **Backblaze B2** : `api.backblazeb2.com`, `*.backblazeb2.com` (IPs variables) — port 443 TCP
5. **ntfy.sh** : port 443 TCP
6. **Let's Encrypt ACME** : `acme-v02.api.letsencrypt.org` — port 443 TCP
7. **Docker Hub + registries** : `*.docker.com`, `*.docker.io`, `ghcr.io`, `quay.io`, `registry.gitlab.com` — port 443 TCP
8. **GitHub (clone+API)** : `github.com`, `api.github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`, `codeload.github.com` — port 443 TCP
9. **APT Debian + Proxmox** : `deb.debian.org`, `security.debian.org`, `download.proxmox.com`, `enterprise.proxmox.com` — ports 80 + 443 TCP
10. **Cloudflare API** (DNS-01 challenge) : `api.cloudflare.com` — port 443 TCP
11. **Watchtower image check** : utilisé Docker socket → les registries suffisent

## Stratégie iptables phase 2

### Problème : iptables ne résout pas les hostnames

iptables filtre sur IP, pas domain. Deux approches :

**A. IP-statique** (peu maintenable)
Résoudre les hostnames et hard-coder les /24 observés. Risque de casser quand Cloudflare/AWS change ses /24.

**B. ipset dynamique** (recommandé)
Un cron périodique résout les hostnames critiques et met à jour un ipset :
```text
ipset create allowed-egress hash:ip family inet maxelem 65536 timeout 86400
iptables -A OUTPUT -m set --match-set allowed-egress dst -j ACCEPT
```
Script de refresh : lookup DNS de la liste de domaines whitelistés toutes les heures, `ipset add -exist`.

**C. Hybride pragmatique** (proposé)
- Port-based ACCEPT pour services universels (DNS 53, NTP 123)
- ipset pour les domaines résolus (B2, ntfy, registries, GitHub, APT)
- Wildcard `0.0.0.0/0 UDP 41641` pour Tailscale peers (négociation NAT traversal)

### Règles iptables candidates (draft)

```bash
# Default OUTPUT ACCEPT → DROP (après whitelist en place)
# Save pre-state pour rollback

# Whitelist par port (universel)
iptables -A OUTPUT -p udp --dport 53 -m conntrack --ctstate NEW -j ACCEPT  # DNS
iptables -A OUTPUT -p tcp --dport 53 -m conntrack --ctstate NEW -j ACCEPT
iptables -A OUTPUT -p udp --dport 123 -m conntrack --ctstate NEW -j ACCEPT # NTP
iptables -A OUTPUT -p udp --dport 3478 -m conntrack --ctstate NEW -j ACCEPT # STUN
iptables -A OUTPUT -p udp --dport 41641 -m conntrack --ctstate NEW -j ACCEPT # TS peer
iptables -A OUTPUT -p tcp --dport 853 -m conntrack --ctstate NEW -j ACCEPT # DoT

# ipset pour les domaines HTTPS
ipset create allowed-https-dst hash:ip timeout 86400 comment
iptables -A OUTPUT -m set --match-set allowed-https-dst dst -p tcp --dport 443 \
    -m conntrack --ctstate NEW -j ACCEPT

# ACME HTTP-01 (Let's Encrypt peut utiliser HTTP 80 en fallback)
iptables -A OUTPUT -m set --match-set allowed-http-dst dst -p tcp --dport 80 \
    -m conntrack --ctstate NEW -j ACCEPT

# Established+related (réponses)
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Log les drops pour débug
iptables -A OUTPUT -m limit --limit 5/min -j LOG --log-prefix "[EGRESS-DROP] "

# DROP
iptables -P OUTPUT DROP
```

Script `egress-ipset-refresh.sh` (cron hourly) :
```bash
#!/bin/bash
DOMAINS=(
  api.backblazeb2.com
  f003.backblazeb2.com
  ntfy.sh
  acme-v02.api.letsencrypt.org
  github.com
  api.github.com
  raw.githubusercontent.com
  codeload.github.com
  objects.githubusercontent.com
  registry-1.docker.io
  auth.docker.io
  production.cloudflare.docker.com
  ghcr.io
  deb.debian.org
  security.debian.org
  download.proxmox.com
  enterprise.proxmox.com
  api.cloudflare.com
  login.tailscale.com
  controlplane.tailscale.com
)

ipset flush allowed-https-dst
for d in "${DOMAINS[@]}"; do
  for ip in $(dig +short +timeout=3 A "$d" AAAA "$d" 2>/dev/null); do
    # Skip empty, CNAME lines, IPv6
    [[ "$ip" =~ ^[0-9.]+$ ]] && ipset add allowed-https-dst "$ip" -exist
  done
done
```

## Rollback auto 5min

Avant `iptables -P OUTPUT DROP`, lancer `at now + 5 minutes <<< "iptables -P OUTPUT ACCEPT"`. Si on casse la SSH ou le DNS, ça revient tout seul après 5 min. Retirer le `at` une fois la validation OK.

## Plan d'exécution

1. **Déployer `egress-audit.sh` sur galahad + lancelot** (leur pipeline sortant est inconnu — PBS uploads, cluster corosync, registry pulls, updates Proxmox)
2. **Attendre 48-72h** de collecte sur les 3 hosts
3. **Refaire l'analyse sur les 3** (relancer ce doc)
4. **Implémenter `egress-ipset-refresh.sh`** + tester hors DROP (mode shadow)
5. **Activer OUTPUT DROP avec rollback 5min** sur penny d'abord
6. **Si OK 48h**, propager sur galahad + lancelot
7. **Documenter les règles dans `homelab-config/system/iptables/`**

## Dépendances / risques

- Watchtower check d'images peut échouer si registry Docker pas résolu correctement
- Let's Encrypt renew peut échouer silencieusement (90 jours avant de voir le cert expire)
- Backblaze B2 rotation d'IPs → cron refresh robuste obligatoire
- NTP désynchro si whitelist manque `time.cloudflare.com`
- Tailscale peer discovery : STUN OK via port 3478 mais `41641` vers n'importe qui = compromis

## Alert pour détecter les faux-negatifs

Après `OUTPUT DROP` actif, laisser tourner 7 jours et grep `[EGRESS-DROP]` dans journalctl. Si >0 hit par jour, whitelist incomplète → patcher.
