# Tailscale — ACLs et acces mesh

Le VPN mesh Tailscale est geré depuis [login.tailscale.com](https://login.tailscale.com). Il **n'y a aucun port forwarde** sur la Freebox — tout le trafic inter-devices passe par le tunnel WireGuard.

## Tailnet

| | |
|---|---|
| Tailnet | `tail8850a4.ts.net` |
| Magic DNS | Actif |
| HTTPS certs | Actif (cert `.ts.net` automatique) |

## Machines connectees

| Hostname Tailscale | IP | Type | Role |
|---|---|---|---|
| `homelab` | `100.97.239.90` | linux | penny (RPi4, DietPi) |
| `guardian` | `100.74.145.26` | linux | LXC 100 sur galahad (DNS + healthcheck) |
| `pve1` | `100.98.58.121` | linux | galahad (Proxmox) — **a renommer** `galahad` |
| `pve2` | `100.69.6.13` | linux | lancelot (Proxmox) — **a renommer** `lancelot` |
| `iphone175` | `100.84.188.65` | iOS | Mobile |
| `macbook-pro-de-gabin` | `100.68.165.36` | macOS | Laptop |
| `a00783` | `100.64.114.40` | windows | Desktop |

Les LXC `logs` (101, sur lancelot) et `vault` (102, sur galahad) ne sont **pas** sur Tailscale — accessibles via l'IP LAN de leur host uniquement.

## Tailscale SSH

Mode `check` (MFA navigateur a chaque connexion) active sur `homelab`, `pve1`, `pve2`. Aucun port 22 expose sur aucun host.

```bash
ssh gabins@homelab   # via MagicDNS Tailscale
ssh gabins@pve1      # galahad
ssh gabins@pve2      # lancelot
```

Fallback OpenSSH dispo sur les 3 hosts (ports 2806/2807/2808), cle Ed25519 uniquement.

## Politique ACL

La configuration ACL exacte vit dans la console Tailscale et est versionnee par Tailscale (pas dans ce repo). Resume de la politique :

### Groupes

| Groupe | Membres |
|---|---|
| `group:admin` | `gabin@gabin-simond.fr` (proprietaire tailnet) |

Pas de compte multi-utilisateur pour l'instant (homelab personnel).

### Tags

| Tag | Usage |
|---|---|
| `tag:homelab` | penny |
| `tag:proxmox` | galahad + lancelot |
| `tag:lxc` | guardian (et futurs LXCs sur Tailscale) |
| `tag:client` | iphone, macbook, desktop |

### Regles d'acces (principe)

- `group:admin` : acces complet a tous les tags.
- `tag:client` : acces aux services homelab (ports 80, 443, 53, 3000, 8006) mais pas SSH (sauf via Tailscale SSH).
- `tag:homelab` / `tag:proxmox` / `tag:lxc` : pas d'init d'appels sortants hors du tailnet (serveurs passifs).

### Tailscale SSH

```
{
  "sshRules": [
    {
      "action": "check",  // MFA navigateur
      "src": ["group:admin"],
      "dst": ["tag:homelab", "tag:proxmox"],
      "users": ["gabins", "root"]
    }
  ]
}
```

## Revocation

Procedure en cas de vol / perte / compromission d'un device :

1. [login.tailscale.com](https://login.tailscale.com) > **Machines**
2. Selectionner le device > **Disable** (acces coupe immediatement)
3. Si perdu definitivement : **Remove**
4. Rotation globale cles : **Settings > Keys > Auth keys > Revoke**
5. Les autres devices doivent re-authentifier (sauf ceux avec *key expiry disabled*)

## Key expiry

Desactive sur les serveurs (`homelab`, `guardian`, `galahad`, `lancelot`) pour eviter qu'un serveur headless perde l'acces mesh sans intervention humaine. Les clients (iphone, macbook, desktop) gardent l'expiry par defaut (180 jours) + re-auth interactive.

## Commandes utiles

```bash
tailscale status            # liste machines et connectivite
tailscale whois <IP>        # qui est connecte sur cette IP
tailscale ping <host>       # ping direct ou relay via DERP
tailscale up --ssh          # reactiver Tailscale SSH si coupe
tailscale netcheck          # diagnostics NAT / DERP
```

## A faire

- [ ] Renommer `pve1` -> `galahad` et `pve2` -> `lancelot` dans la console Tailscale pour aligner sur la convention de naming.
- [ ] Documenter la config ACL JSON exacte (export depuis la console) pour backup.
- [ ] Envisager d'ajouter les LXC `logs` et `vault` sur Tailscale (permettrait SSH direct + acces monitoring hors LAN).
