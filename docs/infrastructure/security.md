# Securite

Doctrine securite : **qui on defend contre quoi, jusqu'ou**, et **comment les credentials sont gerees**.

Pour les mesures techniques par couche (sysctl, firewall rules, SSH, containers) : [hardening.md](hardening.md).
Pour les actions restantes : [security-roadmap.md](security-roadmap.md).
Pour la procedure en cas d'incident : [break-glass.md](break-glass.md).

---

## Modele de menace

| Acteur | Capacite | Mesures |
|---|---|---|
| Script kiddies internet | Scans automatises, brute-force | Pas de port forward, Tailscale only, fail2ban, SSH cles uniquement |
| FAI / MITM | Interception trafic | TLS partout, WireGuard mesh (Tailscale), DNSSEC |
| Voisin LAN compromis | Acces reseau local | Firewall iptables DROP, services admin limites LAN+TS, Authelia 2FA |
| Vol physique RPi/SSD | Acces direct au disque | Backups off-site OK — chiffrement disque **a faire** (Phase OPNsense) |
| Invite / famille | WiFi domestique | A couvrir avec OPNsense + VLANs (Phase 2) |
| Supply chain Docker | Image malveillante | WUD surveille versions — signature verification **a faire** (P2) |
| Compromission cle SSH | sudo NOPASSWD = root immediat | Passphrase + YubiKey ssh-agent — **a deployer cote client** (P2) |
| Phishing TOTP (AITM) | Replay credentials | WebAuthn FIDO2 (YubiKey) actif sur Authelia |

**Hors perimetre** : APT etat-nation, compromission providers (Cloudflare / LE / Tailscale), vol master Vaultwarden (SPOF assume).

---

## Politique de credentials

### Comptes humains

**Un seul compte nominatif partout** : `gabins`.

- Jamais `admin`, `pi`, ou `gabin` : noms previsibles = cibles automatisees.
- `gabins` (avec `s`) : legere variation pour casser les scripts.
- Format futur : `<prenom><initiale_nom>` (ex: `gabins`).

Comptes legacy (`admin`, `gabin`) : **tous supprimes** la ou ils existaient (Grafana admin desactive, Proxmox gabin@authelia retire, etc.).

### Comptes de service

Format `svc-<fonction>` : `svc-homepage`, `svc-backup`. Pas de mot de passe utilisateur — tokens API ou cles SSH exclusivement.

Exceptions admises (pas SSO) :
- **`root@pam`** sur Proxmox : inevitable (compte systeme). Protection : SSH cle + fail2ban + ACL `gabins@authelia` Administrator prime.
- **`gabins` AdGuard (bcrypt local)** : AdGuard ne supporte pas OIDC. Mitigation prevue : ForwardAuth Authelia devant.

### Mots de passe

| Niveau | Services | Longueur | Rotation |
|---|---|---|---|
| Critique | Authelia, Vaultwarden master, Proxmox root@pam | 32 chars | A la compromission |
| Eleve | AdGuard local, Portainer fallback | 32 chars | A la compromission |
| OIDC clients | Secrets OIDC (Proxmox, Portainer, Beszel, Grafana) | 256 bits | 12 mois max |

Generation : `openssl rand -base64 48 | head -c 32`.
Stockage : **exclusif Vaultwarden**. Jamais dans un script, un `.env` versionne ou un message.

### Authentification forte

| Service | Methode | Auto-login | Internal login |
|---|---|---|---|
| Authelia | TOTP + WebAuthn FIDO2 YubiKey | — (source de verite) | — |
| Proxmox galahad/lancelot | OIDC Authelia (two_factor) | Non (realm selector) | `root@pam` (inevit.) |
| Portainer | OIDC Authelia (two_factor) | **Oui** (SSO + hide internal) | `gabins` local (break-glass) |
| Grafana | OIDC Authelia (two_factor) + PKCE S256 | **Oui** (`auto_login=true`) | Admin desactive en DB |
| Beszel | OIDC Authelia (one_factor) | Non (PocketBase) | Superuser `/_/` separe |
| Homepage / WUD / AdGuard | ForwardAuth Authelia | **Oui** (transparent) | AdGuard bcrypt seul |
| SSH | Cle Ed25519 uniquement | — | — |
| Vaultwarden | Master password + TOTP | — | — |
| Tailscale | WireGuard + SSO identity | — | — |

### Rotation / revocation

| Element | Rotation | Procedure |
|---|---|---|
| Mot de passe gabins (OS) | A la compromission | SSH via Tailscale, `passwd` |
| Cles SSH | Par appareil | `sed -i '/key_pattern/d' ~/.ssh/authorized_keys` sur chaque host |
| Tokens API (Cloudflare, Tailscale, B2) | 12 mois max | UI provider -> nouveau token -> `.env` -> restart service |
| Secrets OIDC | 12 mois max | `openssl rand -base64 32` -> hash pbkdf2 -> update Authelia + service |
| Authelia internals (jwt/session/storage) | A la compromission uniquement | Migration DB necessaire si `encryption_key` change |
| Master Vaultwarden | Au choix | UI Vaultwarden |

### Session Authelia

| Parametre | Valeur | Note |
|---|---|---|
| `expiration` | 4h | Session active |
| `inactivity` | 30m | Timeout si idle |
| `remember_me` | 7d | Cookie persistent (compromise browser = max 7j). Non differenciable par groupe en Authelia v4. |

### Revocation Tailscale

1. [login.tailscale.com](https://login.tailscale.com) > Machines
2. Selectionner appareil > **Disable** (acces immediat coupe)
3. Si perdu definitivement : **Remove**
4. Reauth globale : **Settings > Keys > Auth keys > Revoke**

---

## Inventaire des secrets a stocker dans Vaultwarden

### Authentification primaire

- Master Authelia `gabins` — plain password
- Backup codes TOTP Authelia (si generes)
- YubiKey backup codes

### Internals Authelia

- `jwt_secret` (reset password)
- `session.secret`
- `storage.encryption_key`
- `identity_providers.oidc.hmac_secret`
- OIDC JWKS private key (`oidc.pem`)

### Clients OIDC (secret en clair — les hash pbkdf2 restent dans `configuration.yml`)

- `proxmox` client secret
- `portainer` client secret
- `grafana` client secret
- `beszel` client secret

### OS / Infra

- `root@pam` Proxmox galahad + lancelot
- Passphrases cles SSH (par machine)
- bcrypt AdGuard gabins
- Portainer admin (fallback)

### Externals

- Cloudflare API token (`CF_DNS_API_TOKEN`)
- Tailscale auth key (`TS_AUTHKEY`)
- Backblaze B2 credentials (`B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`)
- ntfy topic URL

### Homepage widgets (readonly service accounts)

- `HOMEPAGE_VAR_PVE_TOKEN_ID` + `_SECRET`
- `HOMEPAGE_VAR_PORTAINER_KEY`
- `HOMEPAGE_VAR_BESZEL_USER` + `_PASS`
- `HOMEPAGE_VAR_ADGUARD_USER` + `_PASS`

### Hors Vault (volontaire — eviter la dependance circulaire)

- **Restic backup password** : cle USB physique + copie papier. Si Vault perdu + restic perdu = backups illisibles.
- **Master password Vaultwarden** : dans la tete + papier en coffre.

---

## Access distant

### Tailscale mesh

Acces a tous les services via IP Tailscale (`100.64.0.0/10`). **Aucun port Freebox forwarde** — tout passe par le tunnel WireGuard.

**Tailscale SSH** actif sur homelab / galahad / lancelot :
- Auth par identite Tailscale (pas de cles a gerer)
- Mode `check` : validation navigateur a chaque connexion (MFA implicite)
- Certificats rotated automatiquement
- Aucun port 22 expose

```bash
ssh gabins@homelab    # penny via Tailscale (MagicDNS)
ssh gabins@pve1       # galahad — Tailscale hostname pas encore renomme
ssh gabins@pve2       # lancelot — idem
```

Note : les IP Tailscale restent stables (100.98.58.121 pour galahad, 100.69.6.13 pour lancelot). A faire : renommer les hotes Tailscale en `galahad`/`lancelot` dans [login.tailscale.com](https://login.tailscale.com).

### TLS partout

Traefik termine le TLS avec certificats Let's Encrypt (DNS challenge Cloudflare) sur `*.home.gabin-simond.fr`.

CAA records actifs : `letsencrypt.org` uniquement + `iodef mailto:`.

---

## SSO Authelia — resume

| Service | Methode | Policy | Consent |
|---|---|---|---|
| Proxmox galahad/lancelot | OIDC natif | two_factor | pre-configured 1y |
| Portainer | OIDC natif | two_factor | pre-configured 1y |
| Grafana | OIDC natif + PKCE | two_factor | pre-configured 1y |
| Beszel | OIDC natif + PKCE | one_factor | pre-configured 1y |
| Traefik dashboard | ForwardAuth Authelia | two_factor (default) | N/A |
| AdGuard UI | ForwardAuth — **a ajouter** | — | — |
| Homepage | **Aucune auth actuellement — a ajouter** | — | — |

Voir [services/authelia.md](../services/authelia.md) pour les configs.

---

## Backups off-site

| Cible | Frequence | Outil | Chiffrement |
|---|---|---|---|
| Backblaze B2 | Quotidien (3h) | `homelab_backup.sh` + restic | AES-256 client-side |
| SD card locale | Quotidien (3h) | `homelab_backup.sh` (tar.gz) | Non |

Retention restic : 7 daily / 4 weekly / 6 monthly + prune auto.
DR drill Vaultwarden : **RTO 7 secondes** (valide 2026-04-13). A repeter trimestriellement.

Voir [backups.md](backups.md) pour la procedure complete.
