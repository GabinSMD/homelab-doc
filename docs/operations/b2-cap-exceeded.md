# Runbook : Backblaze B2 cap exceeded

!!! success "RÉSOLU 2026-05-11 — migration vers Cloudflare R2"
    Suite à l'incident du 2026-05-11 (Storage cap + Transaction cap simultanément exceeded), tout le pipeline backup cloud a été **migré vers Cloudflare R2 EU** ([r2-migration.md](r2-migration.md)). R2 n'a pas de cap journalier — le scénario décrit ci-dessous ne peut plus se reproduire sur ton infra. Le runbook est conservé pour archive et au cas où tu utilises B2 sur un autre projet.

## Symptômes

- ntfy "Restic backup FAILED" et/ou "PBS sync FAILED" depuis penny.
- Logs restic / rclone montrent :
  ```
  b2_get_upload_url: 403: Cannot upload files, storage cap exceeded.
  ```
- `homelab_monitor.sh` log : `RESTIC <repo>: query failed (network/auth/empty)` en boucle.
- `/mnt/ssd/log-homelab/pbs-datastore-sync.log` : `(403 storage_cap_exceeded)`.

## Cause

Le bucket B2 `gabin-homelab-backups` a atteint un des **3 caps** distincts fixés dans le dashboard Backblaze :

- **Daily Storage Cap** : total bytes stockés > seuil → uploads rejetés en 403
- **Daily Class B Transactions Cap** : metadata API calls (list, get-info) > seuil → l'API entière rejette 403 `transaction_cap_exceeded`
- **Daily Class C Transactions Cap** : write API calls (upload, delete) > seuil → uploads rejetés

Aucune commande CLI ne peut bump le cap — c'est une action UI Backblaze.

⚠️ **Effet circuit breaker manquant** : si les scripts retry en boucle (cron 1/min), le Storage Cap exceeded peut **cascader** vers Transaction Cap exceeded en quelques heures. À l'incident du 2026-05-11, l'auth B2 elle-même a fini par 403 `transaction_cap_exceeded`. Bumper le Storage Cap seul ne suffit pas — vérifier les 3.

## Pipelines impactés

Tout ce qui pousse vers le bucket :

1. `homelab_backup.sh` (penny, 03:00) → restic depuis penny
2. `pbs-datastore-sync.sh` (penny, 03:30) → rclone PBS datastore → B2
3. `vault-restic-backup` (LXC 102, hourly) → restic vault
4. `dnsfailover-restic-backup` (LXC 100, daily) → restic dns-failover
5. `logs-restic-backup` (LXC 101, daily) → restic logs

Layer **NON** impactée :

- `vzdump` (galahad + lancelot → PBS LXC 103) : reste sur ZFS local, **OK**.

Donc Layer 1-2 (vzdump → PBS local) tiennent. Layer 3 (offsite cloud) gelée.

## Fix immédiat (5 min)

### 1. Bump le cap dans le dashboard Backblaze

1. <https://secure.backblaze.com> → **My Account → Caps & Alerts**
2. Bucket `gabin-homelab-backups` → **Storage Cap** : passe de la valeur actuelle à **30 GB** (ou plus selon trajectoire)
3. Recommandé : ajouter une alerte mail Backblaze à 80% pour double-trigger
4. Coût : ~0.005 €/GB/mois au-delà du free tier (10 GB), soit ~0.10 €/mois pour 30 GB cap

### 2. Mettre à jour `B2_CAP_BYTES` dans `/root/.restic-env` (sealed)

Sur penny :

```bash
# Décrypte → édite → re-encrypt
cd /mnt/ssd/config
sops system/secrets/restic-env.enc
# Ajoute (ou modifie) la ligne :
#   B2_CAP_BYTES=32212254720   # 30 GB
# Save / quit, sops chiffre auto.
```

`homelab_monitor.sh` lira ça à la prochaine tick (1 min) et calculera le %.

### 3. Relancer les pipelines failed

```bash
# Penny — restic homelab + PBS rclone
/root/homelab_backup.sh
/mnt/ssd/config/scripts/pbs-datastore-sync.sh

# LXC backups (via SSH alias dans /root/.ssh/config)
ssh vault 'sudo /usr/local/bin/vault-restic-backup.sh'
ssh dns-failover 'sudo /usr/local/bin/dnsfailover-restic-backup.sh'
ssh logs 'sudo /usr/local/bin/logs-restic-backup.sh'
```

### 4. Vérification

```bash
# Le monitor next tick affichera la cap %
tail -f /mnt/ssd/log-homelab/homelab_monitor.log | grep "B2 CAP"

# Ou directement
restic snapshots --tag homelab --latest 1
```

## Prévention

- `homelab_monitor.sh` check `check_b2_cap` (commit 2026-05-11) probe l'API B2 toutes les 15 min et alerte à 80% (default) et 95% (urgent).
- Cap recommandé : **2× la trajectoire actuelle** (si tu fais ~500 Mo/jour de delta restic, cap à 30 Go te donne ~6 semaines de marge avant retention rotate).
- À l'ajout d'un nouveau pipeline backup B2 : recalculer la trajectoire et bumper si nécessaire.

## Historique

- **2026-05-10** : split `pbs-datastore` de Restic vers rclone direct → +10.28 GiB sur B2 (memory `project_b2_caps_pbs_separation_20260510.md`).
- **2026-05-11** : cap exceeded la nuit suivante. 6 pipelines fail. Diagnostic via `cscli`/PBS API/restic logs. Fix : bump cap 10→30 GB, ajout `check_b2_cap` au monitor, ce runbook.

## Voir aussi

- [backups.md](./backups.md) — stratégie 3-2-1 globale
- [notif-hygiene.md](./notif-hygiene.md) — pattern de réduction du bruit ntfy
- Memory : `project_b2_caps_pbs_separation_20260510.md`
