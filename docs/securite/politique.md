# Sécurité

Doctrine sécurité : **qui on defend contre quoi, jusqu'ou**, et **comment les credentials sont gerees**.

Pour les mesures techniques par couche (sysctl, firewall rules, SSH, containers) : [hardening.md](hardening.md).
Pour les actions restantes : [roadmap.md](roadmap.md).
Pour la procédure en cas d'incident : [break-glass.md](../operations/break-glass.mdx).

---

## Modèle de menace

| Acteur | Capacité | Mesures |
|---|---|---|
| Script kiddies internet | Scans automatises, brute-force | Pas de port forward, Tailscale only, fail2ban, SSH clés uniquement |
| FAI / MITM | Interception trafic | TLS partout, WireGuard mesh (Tailscale), DNSSEC |
| Voisin LAN compromis | Acces réseau local | Firewall iptables DROP, services admin limités LAN+TS, Authelia 2FA |
| Vol physique RPi/SSD | Acces direct au disque | Backups off-site OK — chiffrement disque **a faire** (Phase OPNsense) |
| Invite / famille | WiFi domestique | A couvrir avec OPNsense + VLANs (Phase 2) |
| Supply chain Docker | Image malveillante | Épinglage par digest `@sha256` — **les 22 images de penny**, le LXC vault, le LXC pulse, et 3 des 4 du LXC logs (la 4e, `homelab/ntfy-relay`, est construite localement). Relevé le 2026-09-24 ; cette ligne annonçait encore « 4 images flottent sur le LXC logs ». Plus d'auto-update depuis le retrait de Watchtower le 2026-07-06 ; `digest-drift-check` notifie l'écart amont **et** les images non épinglées — vérification de signature **à faire** (P2) |
| Compromission clé SSH | sudo NOPASSWD = root immédiat | Passphrase + YubiKey ssh-agent — **a déployer côté client** (P2) |
| Phishing TOTP (AITM) | Replay credentials | WebAuthn FIDO2 (YubiKey) actif sur Authelia |

**Hors perimetre** : APT état-nation, compromission providers (Cloudflare / LE / Tailscale), vol master Vaultwarden (SPOF assume).

---

## Politique de credentials

### Comptes humains

**Un seul compte nominatif partout** : `gabins`.

- Jamais `admin`, `pi`, ou `gabin` : noms previsibles = cibles automatisees.
- `gabins` (avec `s`) : légère variation pour casser les scripts.
- Format futur : `<prenom><initiale_nom>` (ex: `gabins`).

Comptes legacy (`admin`, `gabin`) : **tous supprimés** la ou ils existaient (Grafana admin désactivé, Proxmox gabin@authelia retire, etc.).

### Comptes de service

Format `svc-<fonction>` : `svc-homepage`, `svc-backup`. Pas de mot de passe utilisateur — tokens API ou clés SSH exclusivement.

Exceptions admises (pas SSO) :
- **`root@pam`** sur Proxmox : inevitable (compte système). Protection : SSH clé + fail2ban + ACL `gabins@authelia` Administrator prime.
- **`gabins` AdGuard (bcrypt local)** : AdGuard ne supporte pas OIDC. Mitigation prévue : ForwardAuth Authelia devant.

### Mots de passe

| Niveau | Services | Longueur | Rotation |
|---|---|---|---|
| Critique | Authelia, Vaultwarden master, Proxmox root@pam | 32 chars | A la compromission |
| Élevé | AdGuard local | 32 chars | A la compromission |
| OIDC clients | Secrets OIDC (Proxmox, Grafana, PBS, Pulse, Forgejo, Outline) | 256 bits | 12 mois max |

Génération : `openssl rand -base64 48 | head -c 32`.
Stockage : **exclusif Vaultwarden**. Jamais dans un script, un `.env` versionne ou un message.

### Authentification forte

| Service | Méthode | Auto-login | Internal login |
|---|---|---|---|
| Authelia | TOTP + WebAuthn FIDO2 YubiKey | — (source de vérité) | — |
| Proxmox galahad/lancelot | OIDC Authelia (two_factor) | Non (realm selector) | `root@pam` (inevit.) |
| Grafana | OIDC Authelia (two_factor) + PKCE S256 | **Oui** (`auto_login=true`) | Admin désactivé en DB |
| Homepage / AdGuard | ForwardAuth Authelia | **Oui** (transparent) | AdGuard bcrypt seul |
| SSH | Clé Ed25519 uniquement | — | — |
| Vaultwarden | Master password + TOTP | — | — |
| Tailscale | WireGuard + SSO identity | — | — |

### Rotation / revocation {#rotation--revocation}

**Page autoritaire pour la politique de rotation.** Les procédures pas-à-pas sont
dans [rotation.md](rotation.md) ; [comptes.md](comptes.md#rotation) y renvoie.

Le critère n'est pas l'âge mais **le secret quitte-t-il la machine ?** Une
rotation coûte (chaque changement d'identifiant a déjà cassé quelque chose en
silence sur ce parc) : on ne paie ce coût que là où il réduit un risque réel.

| Palier | Critère | Exemples |
|---|---|---|
| **Échéance fournisseur** (90 j au plus) | expiration dure imposée par un tiers | clé d'enrôlement Tailscale |
| **12 mois** | voyage, et un tiers l'accepte | jetons API (Cloudflare, R2, PVE, PBS, Pulse, ntfy, outillage), secrets clients OIDC, relais SMTP |
| **À la compromission** | ne quitte jamais le fichier scellé | internes Authelia, clés de signature d'application, mots de passe de bases et de services locaux |
| **24 mois** | matériel et reprise | YubiKeys, mots de passe root de secours, master Vaultwarden, clé age |

Une **date de dernière rotation inconnue compte comme échue** : on ne peut pas
affirmer qu'un secret est à jour sans savoir quand il a été tourné.

Le respect de ces cadences est **mesuré chaque jour** par un contrôle qui
notifie les secrets morts, les expirations proches et, le lundi, le
récapitulatif des échéances ; voir [rotation.md](rotation.md#ce-qui-mesure-la-rotation).

| Element | Rotation | Procédure |
|---|---|---|
| Mot de passe gabins (OS) | A la compromission | SSH via Tailscale, `passwd` |
| Clés SSH | Par appareil, à la compromission | `sed -i '/key_pattern/d' ~/.ssh/authorized_keys` sur chaque host |
| Tokens API | 12 mois max | [rotation.md](rotation.md#methode) |
| Secrets OIDC | 12 mois max | [rotation.md](rotation.md#secrets-oidc) |
| Authelia internals (jwt/session/storage/hmac/jwks) | A la compromission uniquement | [rotation.md](rotation.md#internes-authelia) — migration DB si `encryption_key` change |
| Break-glass root, master Vaultwarden | 24 mois max | [rotation.md](rotation.md#materiel-et-reprise) |

### Session Authelia

| Paramètre | Valeur | Note |
|---|---|---|
| `expiration` | 4h | Session activé |
| `inactivity` | 30m | Timeout si idle |
| `remember_me` | 7d | Cookie persistent (compromise browser = max 7j). Non differenciable par groupe en Authelia v4. |

### Revocation Tailscale

1. [login.tailscale.com](https://login.tailscale.com) > Machines
2. Sélectionner appareil > **Disable** (acces immédiat coupe)
3. Si perdu definitivement : **Remove**
4. Reauth globale : **Settings > Keys > Auth keys > Revoke**

---

## Inventaire des secrets a stocker dans Vaultwarden

### Authentification primaire

- Master Authelia `gabins` — plain password
- Backup codes TOTP Authelia (si générés)
- YubiKey backup codes

### Internals Authelia

- `jwt_secret` (reset password)
- `session.secret`
- `storage.encryption_key`
- `identity_providers.oidc.hmac_secret`
- OIDC JWKS private key (`oidc.pem`)

### Clients OIDC (secret en clair — les hash pbkdf2 restent dans `configuration.yml`)

- `proxmox` client secret
- `grafana` client secret
- `pbs` client secret
- `pulse` client secret
- `forgejo` client secret
- `outline` client secret

Les secrets `portainer`, `beszel`, `homelable` et `securo` sont à purger du coffre : leurs
clients ont été retirés de `configuration.yml` en novembre 2026.

### OS / Infra

- `root@pam` Proxmox galahad + lancelot
- Passphrases clés SSH (par machine)
- bcrypt AdGuard gabins

### Externals

- Cloudflare API token (`CF_DNS_API_TOKEN`)
- Tailscale auth key (`TS_AUTHKEY`)
- Cloudflare R2 credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- ntfy topic URL

### Homepage widgets (readonly service accounts)

- `HOMEPAGE_VAR_PVE_TOKEN_ID` + `_SECRET`
- `HOMEPAGE_VAR_PBS_TOKEN_ID` + `_SECRET`
- `HOMEPAGE_VAR_PULSE_TOKEN`
- `HOMEPAGE_VAR_ADGUARD_USER` + `_PASS`
- `HOMEPAGE_VAR_CROWDSEC_USER` + `_PASS`

(Relevé dans `homepage/services.yaml` le 2026-11-04.)

### Hors Vault (volontaire — éviter la dépendance circulaire)

- **Restic backup password** : clé USB physique + copie papier. Si Vault perdu + restic perdu = backups illisibles.
- **Master password Vaultwarden** : dans la tête + papier en coffre.

---

## Voir aussi

- [Hardening](hardening.md) — mesures techniques par couche (sysctl, firewall, SSH, containers)
- [Authelia (SSO)](../services/authelia.md) — configuration SSO et clients OIDC
- [Tailscale ACLs](../architecture/reseau.mdx) — acces distant et politique ACL
- [Backups](../operations/backups.md) — procédure et architecture de sauvegarde
- [Break-glass](../operations/break-glass.mdx) — procédure de reconstruction en cas d'incident
