# Migration backups : Backblaze B2 → Cloudflare R2

## Pourquoi cette migration

B2 free tier impose des **caps quotidiens** sur les transactions (Class B = metadata, Class C = writes). L'incident du 2026-05-11 a montré que ces caps cascadent vite quand 5+ pipelines backup retry en boucle après un échec storage cap. Voir [b2-cap-exceeded.md](./b2-cap-exceeded.md).

Cloudflare R2 free tier :

- 10 GB storage (identique B2)
- **0 egress** (B2 facture l'egress au-delà du free tier)
- **1M Class A** (writes) + **10M Class B** (reads) gratuit par mois (B2 cap journalier au lieu de mensuel)
- API S3-compatible (restic + rclone supportent S3 natif)

Pour un homelab à <10 GB de backups avec quelques scripts qui shippent, R2 free tier couvre **largement**, sans risque de cap-exceeded.

## Prérequis

- Compte Cloudflare actif (free)
- R2 activé (demande carte de crédit anti-abuse, **rien facturé sous 10 GB**)
- 1 bucket R2 créé, en EU recommandé (`EEUR` ou `WEUR`)
- 1 API token R2 avec **Object Read & Write** scoped au bucket

Notes prises depuis le dashboard Cloudflare :
- **Account ID**
- **Bucket name** (par défaut `homelab-backups`)
- **Access Key ID**
- **Secret Access Key**

## Migration penny (one-shot, automatisé)

Sur penny :

```bash
sudo /mnt/ssd/config/scripts/migrate-restic-r2.sh
```

Le script :

1. Prompte les 4 valeurs Cloudflare (creds masqués)
2. Teste la reachability via rclone
3. Re-seal `system/secrets/restic-env.enc` avec les nouvelles vars R2 (RESTIC_REPOSITORY=s3:..., AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_ENDPOINT)
4. Met à jour `/root/.restic-env` (live, plaintext mode 600)
5. Ajoute un remote `[r2]` à `/root/.config/rclone/rclone.conf`
6. Patch `scripts/pbs-datastore-sync.sh` : `DEST="b2:..."` → `DEST="r2:..."`, désactive `--b2-hard-delete`
7. Init les 4 repos restic sur R2 (`restic`, `restic-vault`, `restic-dnsfailover`, `restic-logs`)

L'ancien remote `[b2]` rclone et les vars `B2_*` sont **conservés** pour rollback rapide pendant la transition.

## Vérification post-migration

```bash
# 1. Connectivity
restic snapshots --limit 1     # Doit lister vide ou snapshot init

# 2. Premier backup penny
/root/homelab_backup.sh
# Surveiller :
tail -f /mnt/ssd/log-homelab/homelab_backup.log

# 3. Premier sync PBS
/root/pbs-datastore-sync.sh
tail -f /mnt/ssd/log-homelab/pbs-datastore-sync.log

# 4. Vérifier la taille R2
rclone size r2:homelab-backups
```

## Migration des LXCs (manuel)

Les LXC `vault` (102), `dns-failover` (100), `logs` (101) ont leur propre `/root/.restic-env`. Pour chacun :

```bash
ssh <lxc-alias>     # vault / dns-failover / logs (alias dans /root/.ssh/config)

# Sauvegarde puis edit
sudo cp /root/.restic-env /root/.restic-env.bak
sudo nano /root/.restic-env
```

Remplacer dans `.restic-env` :

```bash
# AVANT (B2)
RESTIC_REPOSITORY=b2:gabin-homelab-backups:<repo-name>
B2_ACCOUNT_ID=<...>
B2_ACCOUNT_KEY=<...>

# APRÈS (R2)
RESTIC_REPOSITORY=s3:https://<account-id>.r2.cloudflarestorage.com/homelab-backups/<repo-name>
AWS_ACCESS_KEY_ID=<...>
AWS_SECRET_ACCESS_KEY=<...>
```

Mapping `<repo-name>` :

| LXC | Repo |
|-----|------|
| vault (102) | `restic-vault` |
| dns-failover (100) | `restic-dnsfailover` |
| logs (101) | `restic-logs` |

Puis tester :

```bash
sudo bash -c 'set -a; . /root/.restic-env; set +a; restic snapshots --limit 1'
# Si init nécessaire :
sudo bash -c 'set -a; . /root/.restic-env; set +a; restic init'
# Run le backup
sudo /usr/local/bin/<lxc>-restic-backup.sh
```

## Rollback

Si pour une raison l'R2 ne marche pas, restaure la config B2 :

```bash
# Penny
sudo cp /root/.restic-env.bak-<timestamp> /root/.restic-env  # si backup créé manuellement
# Ou re-seal sops avec les anciennes vars B2 depuis le commit pre-migration
cd /mnt/ssd/config
git checkout <commit-pre-migration> -- system/secrets/restic-env.enc
sops --decrypt system/secrets/restic-env.enc > /root/.restic-env
chmod 600 /root/.restic-env

# Revert pbs-datastore-sync.sh
git checkout <commit-pre-migration> -- scripts/pbs-datastore-sync.sh
cp scripts/pbs-datastore-sync.sh /root/pbs-datastore-sync.sh
```

## Nettoyage post-validation (1-2 semaines après)

Une fois R2 stable :

1. **Retirer le remote `[b2]`** de `/root/.config/rclone/rclone.conf` (manuel ou via re-seal sops)
2. **Retirer les vars `B2_*`** du `system/secrets/restic-env.enc` (re-seal sans elles)
3. **Supprimer le bucket B2** (depuis Backblaze dashboard) après confirm visuel que rien ne pointe dessus
4. **Mettre à jour `b2-cap-exceeded.md`** pour ajouter "RESOLU 2026-05-XX, migration R2" en tête
5. **Supprimer `check_b2_cap()`** de `homelab_monitor.sh` (ou laisser, skip silencieux)

## Différences pratiques B2 vs R2

| | B2 | R2 |
|---|---|---|
| Restic backend | `b2:bucket:path` | `s3:https://...r2.cloudflarestorage.com/bucket/path` |
| Env vars | `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| rclone provider | `type=b2` | `type=s3, provider=Cloudflare` |
| rclone flag suppression | `--b2-hard-delete` actif | N/A (R2 hard-delete par défaut) |
| Caps | journalier (storage/transactions B/C) | mensuel (writes/reads), plus large |
| Pricing au-delà free | $0.005/GB/mo + transactions + egress | $0.015/GB/mo + transactions, **egress gratuit** |
| Versioning | Optionnel | Optionnel (à activer dans bucket settings) |

## Monitoring post-migration

- `homelab_monitor.sh check_restic_repos_freshness` continue de marcher tel quel (lit `RESTIC_REPOSITORY`, agnostic du backend)
- `homelab_monitor.sh check_b2_cap` skip silencieusement quand `B2_ACCOUNT_ID` n'est pas dans `.restic-env`
- L'usage R2 actuel est visible dans Cloudflare dashboard : R2 → bucket → Overview
- Pour alerter à 80% de 10 GB (8 GB) : variable `B2_CAP_BYTES=8589934592` est conservée dans le sealed env, le check probe le bucket size via S3 ListObjects et compare

## Voir aussi

- [b2-cap-exceeded.md](./b2-cap-exceeded.md) — incident d'origine
- [backups.md](./backups.md) — stratégie 3-2-1
- Migration commit : (à remplir post-merge)
