# Proxmox Backup Server — LXC 103

Sauvegarde native de tous les conteneurs Proxmox, avec déduplication. Complète les
chaînes `restic` directes, qui ne dépendent pas de lui.

| | |
|---|---|
| LXC | 103 `pbs`, sur **lancelot** |
| URL | `backup.home.gabin-simond.fr` → `https://192.168.1.33:8007` |
| Auth | OIDC Authelia (realm `authelia`) + comptes locaux de secours |
| Datastore | `main`, sur un export **NFS de penny** (`/mnt/ssd/pbs-datastore`) |
| Sauvegarde | LXC 100, 101, 102, 103 |
| Copie distante | `pbs-datastore` → Cloudflare R2, par `rclone` direct |

## Le datastore est sur NFS, et c'est le point fragile

Le stockage vit sur penny, pas sur lancelot. L'export est en
`all_squash anonuid=100034` pour que les UID d'un LXC non privilégié tombent
juste.

:::danger[`rpc.nfsd` peut échouer en silence et pendre PBS]
Le service NFS est `oneshot` : s'il échoue sur un `ENOMEM`, systemd affiche
`Finished` — **un succès apparent**. Le montage côté PBS est `hard`, donc il ne
renvoie jamais d'erreur : il attend. Le proxy PBS finit en état `D`
(interruptible sleep), et PBS paraît « down » alors que rien n'a planté.

Le contrôle qui tranche en une commande :

```bash
cat /proc/fs/nfsd/threads     # 0 = le serveur NFS n'a aucun thread
```

Un correctif d'auto-réparation existe désormais côté monitoring. Ne pas conclure
« PBS est mort » sans avoir lu ce fichier.
:::

## Ce que PBS ne protège pas

Les sauvegardes `restic` directes existent **précisément** parce que PBS peut
tomber : chaque LXC critique a sa propre chaîne vers R2, indépendante. Le
2026-04-19, lancelot était hors ligne et PBS avec lui — ces chaînes-là ont
continué de tourner.

Voir [Sauvegardes](../operations/backups.md) pour la stratégie d'ensemble et les
procédures de restauration.
