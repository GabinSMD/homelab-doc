# Spec — Fiabilisation du test de restauration (2026-06-11)

## Contexte

Le drill de restauration mensuel (`restic-drill-monthly.sh`) existe depuis avril
mais n'avait **jamais tourné en conditions réelles** au moment de cette spec :

- cassé du 11 au 29 mai (bug parsing `RESTIC_REPOSITORY` post-migration R2) ;
- sa seule fenêtre d'exécution depuis le fix (1er juin, 05:00) est tombée
  pendant les 3 jours de silence de penny (31/05 → 03/06) ;
- cron ne rattrape jamais un job manqué → prochain essai 1er juillet.

Un run manuel le 2026-06-11 a validé la chaîne : les 4 repos restic restaurent
depuis R2 en 18 s. Restent trois gaps structurels.

## Problèmes

1. **Runs manqués silencieux** : les jobs mensuels en cron n'ont qu'une fenêtre
   par mois ; un downtime au mauvais moment = un mois sans vérification, sans
   aucune alerte.
2. **pbs-datastore non couvert** : synchronisé vers R2 par rclone direct
   (`pbs-datastore-sync.sh`), aucun test d'intégrité ni de restauration.
3. **Drift crontab** : 6 entrées live absentes de `system/crontab` dans le
   repo — penny non reproductible.

## Design

### 1. systemd timers `Persistent=true` (fix de classe pour les runs manqués)

Quatre jobs hebdo/mensuels migrent de cron vers des paires `.service`/`.timer`
dans `homelab-config/system/systemd/`, déployées vers `/etc/systemd/system/` :

| Unit | OnCalendar | Note |
|---|---|---|
| `restic-check` | `*-*-01 04:00` | |
| `restic-drill` | `*-*-01 05:00` | `After=restic-check.service` (sérialise les rattrapages au boot) |
| `digest-drift-check` | `*-*-01 05:00` | |
| `lynis-weekly` | `Sun 05:00` | |

`Persistent=true` : un run manqué pendant un downtime s'exécute au boot suivant.

Les jobs **quotidiens** (`ct-log-monitor`, `pbs-datastore-sync`,
`homelab_backup`, `homelab_monitor`) restent en cron : un run quotidien manqué
se rattrape naturellement le lendemain.

### 2. Couverture pbs-datastore dans le drill

Section ajoutée à `restic-drill-monthly.sh` (même script, même chemin ntfy) :

- `rclone check` local vs R2 — comparaison checksums via API, pas de download
  massif ;
- restauration témoin : download d'un fichier depuis R2 vers `/tmp`,
  comparaison md5 avec la copie locale, cleanup.

Échec → alerte ntfy haute priorité, identique aux repos restic.

### 3. Resync `system/crontab`

Le crontab live final (amputé des 4 jobs migrés) est committé dans
`homelab-config/system/crontab`.

## Validation

- `systemctl start` manuel de chaque service → exit 0 + logs ;
- `systemctl list-timers` → les 4 échéances visibles ;
- drill complet (4 repos restic + pbs-datastore) passe de bout en bout.

Le comportement `Persistent=true` n'est pas simulé (comportement systemd
documenté) ; il sera observé au premier downtime réel chevauchant une fenêtre.

## Hors scope

- Modification des scripts de backup eux-mêmes ;
- dead-man-switch Grafana ;
- migration des jobs quotidiens vers des timers.
