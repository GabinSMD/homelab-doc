# Roadmap securite

Priorisation pragmatique des actions de hardening restantes, classee par **impact / effort** plutot que par ordre chronologique.

Base : etat de `security.md` au commit `8fe1ed3` (13 avril 2026).

---

## Deja fait

- [x] Threat model explicite documente
- [x] Politique de rotation / revocation documentee
- [x] Procedure de revocation Tailscale
- [x] Backups off-site B2 + SD card locale
- [x] WebAuthn FIDO2 actif sur Authelia
- [x] `docker-socket-proxy` avec endpoints whitelist
- [x] `cap_drop: ALL` + reseau `socket` isole (Vaultwarden, Authelia)

---

## P0 — Critiques court terme (< 1 jour cumule)

Les actions a plus haut ratio impact/effort.

### 1. Chiffrement client-side des backups B2

**Probleme** : le chiffrement precedent etait server-side B2. Un compte B2 compromis = backups accessibles.

**Action** : restic avec cle de chiffrement locale (AES-256 client-side).

**Status** : [x] Implemente (13 avril 2026)

**Configuration** :
- Repo : `b2:gabin-homelab-backups:restic` (meme bucket, sous-dossier dedie)
- Cle : AES-256, stockee dans `/root/.restic-env` (chmod 600, root-only)
- Credentials B2 : ID + Key reutilises de rclone config
- Integre au `homelab_backup.sh` quotidien (3h cron)

**Retention** :
- 7 snapshots quotidiens
- 4 snapshots hebdomadaires
- 6 snapshots mensuels
- Prune automatique apres chaque backup

**Coexistence** : les tar.gz legacy `rclone sync` sont gardes en parallele pendant 2-4 semaines pour double verification, avec `--exclude restic/**` pour ne pas ecraser restic.

**Important** : le mot de passe restic doit etre sauvegarde :
- Dans Vaultwarden (entree "Restic B2 backup")
- Sur une cle USB chiffree physiquement separee

**Sans le mot de passe = backups irrecouvrables.**

### 2. Scope du token Cloudflare API

**Probleme** : verifier que le token Traefik n'a pas des permissions globales.

**Permissions attendues** :
- `Zone:DNS:Edit` uniquement
- Scope : `gabin-simond.fr` uniquement (pas "All zones")
- Pas de `Zone:Zone:Read` global
- Pas de `User:User Details:Read`

**Effort** : 15 min.

**Status** : [x] Verifie (13 avril 2026) — 1 seule zone accessible, scope OK.

### 3. DR drill Vaultwarden

**Probleme** : `PRAGMA integrity_check` verifie le fichier, pas la capacite a restaurer depuis zero.

**Action** : sur une VM/LXC jetable :
1. Pull backup B2
2. Spin up Vaultwarden avec volume restaure
3. Se connecter + verifier credentials
4. Chronometrer : c'est le RTO reel

**Status** : [x] Teste (13 avril 2026)

**Resultats** :
- **RTO reel : 7 secondes** (download B2 → extract → container up + login page 200)
- DB SQLite integre : 1 user (`simond.gabin@proton.me`), 12 ciphers, 3 folders
- Dernier cipher : 2026-04-12 (cipher recent trouve)

**Procedure validee** :
```bash
DRILL_DIR=/tmp/vw-dr-drill
mkdir -p "$DRILL_DIR/restore"
rclone copy b2:gabin-homelab-backups/vaultwarden_LATEST.tar.gz "$DRILL_DIR/"
tar xzf "$DRILL_DIR"/vaultwarden_*.tar.gz -C "$DRILL_DIR/restore"
docker run -d --name vw-dr-test -v "$DRILL_DIR/restore:/data" -p 8089:80 vaultwarden/server:latest
# Login sur http://localhost:8089 avec master password
```

**A repeter** : tous les 3 mois minimum.

---

## P1 — Important moyen terme (1-3 jours cumule)

### 4. Lynis audit baseline + cron hebdomadaire

**Action** : installer sur penny, galahad, lancelot. Run initial + `/etc/lynis/custom.prf` par host. Cron hebdo push vers ntfy.

**Livrable** : score baseline + `lynis-weekly.sh` + doc `auditing.md`.

**Effort** : 2-3h initial + 1h par host pour tuner.

**Status** : [ ] A faire

### 5. auditd + sysctl additionnels

Post-Lynis. Installer auditd, regles ciblees (auth events, sudo, SSH config), sysctl additionnels (`kernel.yama.ptrace_scope=2`, `kernel.kptr_restrict=2`, `kernel.dmesg_restrict=1`, `fs.protected_hardlinks=1`).

**Effort** : 2-3h. Ne pas aller trop loin sur les regles audit au debut — le bruit tue le signal.

**Status** : [ ] A faire

### 6. Loki + Promtail centralisation logs

**Action** : LXC sur lancelot avec Loki + Grafana. Promtail sur les 3 hosts. Retention 30j. Dashboards : auth failures, 4xx/5xx Traefik, fail2ban bans.

**Effort** : demi-journee.

**Gain** : passer de "je pense qu'on a eu un scan" a "47 requetes 401 le 12 avril entre 03h et 04h depuis .cz".

**Status** : [ ] A faire

### 7. Durcir les `compose` services critiques

Etendre `cap_drop ALL` et `read_only` aux autres services (Traefik, Homepage, WUD, etc.) par priorite.

**Effort** : 1h par service + test.

**Status** : [ ] A faire (partiel : Vaultwarden + Authelia done)

### 8. Migration Vaultwarden en LXC dedie

**Probleme** : Vaultwarden sur SD card penny = maillon faible sur stockage peu fiable.

**Action** : LXC Debian 12 sur **lancelot** (pas galahad, pour eviter co-localisation avec master quorum). Migration DB + attachments. Update Traefik upstream. Snapshots Proxmox quotidiens + backup B2 horaire.

**Effort** : 2-3h incluant test de login depuis tous les devices. Penny garde en fallback inactif 2 semaines avant decommission.

**Gain** : SSD ZFS redondant, snapshots hyperviseur, decouplage SPOF penny.

**Status** : [ ] A faire

### 9. Break-glass documentation formelle (promu de P3)

**Pourquoi P1** : un sinistre ne previent pas. La procedure de reconstruction est un multiplicateur de force.

**Contenu** :
- Sequence de reconstruction si penny + galahad meurent en meme temps
- Depuis quelle backup, avec quelle cle, dans quel ordre
- RTO cible documente
- Scripts de bootstrap si applicable
- Contacts critiques (B2, Cloudflare, Tailscale, FAI)

**Effort** : 2h.

**Status** : [ ] A faire

---

## P2 — Avant demenagement / Phase OPNsense

### 10. VLANs + OPNsense

Deja dans la roadmap existante (Phase 2). Rien a ajouter cote securite.

**Status** : [ ] Bloque par achat hardware

### 11. Chiffrement au repos

**Simplification apres P1-#8** : une fois Vaultwarden migre en LXC sur lancelot, penny devient "transient" (pas de secrets persistants). Plus besoin de LUKS sur penny. Reste :

- **ZimaBoards** : chiffrement ZFS natif au moment de la reinstall Trixie
  ```bash
  zpool create -O encryption=on -O keylocation=file:///root/zfs.key \
    -O keyformat=raw rpool mirror ...
  ```
- Cle stockee dans le TPM (a verifier sur ZimaBoard), sinon USB physiquement separee

**Effort** : non-trivial, a caler avec reinstall.

**Status** : [ ] Bloque par reinstall Trixie galahad

### 12. Supply chain Docker

WUD surveille mais pas de verification signature. Options :
- `cosign verify` sur images critiques en pre-pull
- Pinner les digests (`image: vaultwarden/server@sha256:...`)

**Effort** : 2-3h.

**Status** : [ ] A faire

### 13. Passphrase + YubiKey sur cles SSH client

Deja la YubiKey en main. `ssh-keygen -t ed25519-sk` pour cle resident sur la Yubi. Deploy `authorized_keys` sur les 3 hosts. Revoke anciennes cles.

**Effort** : 1h.

**Status** : [ ] A faire (user side)

---

## P3 — Nice to have

- **HIDS complet** (Wazuh / CrowdSec quand dispo Trixie) : duplique en partie auditd + Loki
- **Bastion host** : LXC dedie acces SSH centralise. Tailscale SSH couvre deja 80%
- **Network IDS** (Suricata / Zeek sur OPNsense) : a considerer une fois OPNsense stable

---

## Tableau synthetique

| Priorite | Action | Effort | Impact | Status |
|---|---|---|---|---|
| P0 | Chiffrement client-side B2 | 2h | Eleve | A faire |
| P0 | Scope token Cloudflare | 15min | Moyen | **Done** |
| P0 | DR drill Vaultwarden | 1h | Eleve | A faire |
| P1 | Lynis + cron | 3h | Moyen | A faire |
| P1 | auditd + sysctl | 3h | Moyen | A faire |
| P1 | Loki + Promtail | 4h | Eleve | A faire |
| P1 | Durcir composes (suite) | 3h | Moyen | Partiel |
| P1 | Migration Vaultwarden LXC | 3h | Tres eleve | A faire |
| P1 | Break-glass doc | 2h | Eleve si incident | A faire |
| P2 | VLANs / OPNsense | — | Eleve | Hardware |
| P2 | Chiffrement au repos (ZFS) | 1j | Eleve | Reinstall |
| P2 | Supply chain Docker | 3h | Moyen | A faire |
| P2 | YubiKey SSH | 1h | Eleve | User side |

**Budget total P0+P1** : ~3 jours de travail etales sur 2-4 semaines.

**Apres ca** : bien protege de l'exterieur → resilient a un incident reel et auditable.
