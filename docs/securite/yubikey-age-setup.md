# age-plugin-yubikey — identité hardware primaire

**Objectif** : deplacer la confiance de la clé age logicielle (fichier) vers une clé **hardware** (YubiKey PIV). La clé privee ne quitte jamais la YubiKey.

**Statut actuel** : la clé age logicielle est sauvegardee EN TANT QUE BACKUP sur la YubiKey (dans un secure note ou OATH slot). Ceci permet une récupération manuelle, mais sops ne l'utilisé pas nativement — il lit toujours le fichier `/root/.config/sops/age/keys.txt`.

**Objectif de cet upgrade** : générer une NOUVELLE identité age stockée directement dans le slot PIV de la YubiKey (clé privee ECDSA P-256 non-exportable). Sops utilisera `age-plugin-yubikey` pour déchiffrer sans avoir besoin du fichier de clé.

---

## Avantages

| Attribut | Clé fichier | Clé YubiKey PIV |
|----------|-------------|------------------|
| Clé privee extractible | Oui (fichier) | Non (hardware) |
| Requiert le device physique | Non | Oui |
| PIN obligatoire (always) | Non | Optionnel (recommandе) |
| Touch pour chaque unlock | Non | Optionnel (recommandе) |
| Supporte par sops out-of-the-box | Oui (age recipient) | Oui (via age-plugin-yubikey) |

---

## Prerequis

- YubiKey 5 séries (PIV support — le 4 ne suffit pas pour ECDSA)
- PIN YubiKey defini (pas le default `123456`)
- PUK YubiKey defini (récupération)
- Management key YubiKey changee (pas la default)
- Si pas encore fait : `ykman piv access change-pin` + `change-puk` + `change-management-key`

---

## Phase 1 — Install du plugin

```text
# arm64 binaire
ARCH=aarch64
VERSION=0.5.0
curl -fsSL -o /tmp/age-plugin-yubikey.tar.gz \
  https://github.com/str4d/age-plugin-yubikey/releases/download/v${VERSION}/age-plugin-yubikey-v${VERSION}-${ARCH}-linux.tar.gz
tar -xzf /tmp/age-plugin-yubikey.tar.gz -C /tmp
install -m 755 /tmp/age-plugin-yubikey/age-plugin-yubikey /usr/local/bin/
age-plugin-yubikey --version
```

Dépendance : `pcscd` (PC/SC daemon) pour parler a la YubiKey :
```text
apt install -y pcscd
systemctl enable --now pcscd
```

## Phase 2 — Générer une identité PIV sur la YubiKey

**Attention** : slot PIV 9c (signature) consommera une génération de clé. Si un certificat existe déjà sur ce slot, il sera ecrase.

```text
age-plugin-yubikey --generate --slot 1 --touch-policy cached --pin-policy once
```

Options :
- `--slot 1` = slot PIV Authentication (9a). Autres slots : 2 (9c), 3 (9d), 4 (9e)
- `--touch-policy cached` = touch requis, valide 15s après (bon compromis)
- `--pin-policy once` = PIN une fois par session YubiKey

Output :
```text
Public key: age1yubikey1q...
Created: 2026-04-17T...
```

Copie le `age1yubikey1...` — c'est le nouveau recipient.

## Phase 3 — Ajouter le recipient a .sops.yaml

Edit `/mnt/ssd/config/.sops.yaml` : dans chaque `creation_rules`, ajouter la ligne `age1yubikey1...` en plus de la clé existante `age1x87pr...`. Format final :

```yaml
creation_rules:
  - path_regex: (^|/)\.env$
    age: >-
      age1x87prsvc7xqjj3c03nsslpa4w96fsnhd95m052k8wufve4htxq2qhnnltm,
      age1yubikey1q...
```

(Le `>-` permet une liste multi-lignes, sops géré la virgule.)

## Phase 4 — Re-chiffrer les fichiers existants avec le nouveau recipient

```text
cd /mnt/ssd/config
sops updatekeys .env.enc
# Puis pour chaque secret sealed :
for f in authelia/secrets/* crowdsec/online_api_credentials.yaml crowdsec/local_api_credentials.yaml; do
    sops updatekeys "$f" 2>/dev/null || true
done
```

`updatekeys` relit `.sops.yaml`, re-chiffré la DEK avec les NOUVEAUX recipients. Les anciens restent valides tant qu'on ne les retire pas de `.sops.yaml`.

## Phase 5 — Tester le déchiffrement via YubiKey

Retirer temporairement la clé fichier pour forcer l'utilisation du plugin :

```text
mv /root/.config/sops/age/keys.txt{,.disabled}
```

Puis test :
```text
sops -d /mnt/ssd/config/.env.enc | head -5
# -> touch YubiKey prompt, PIN si policy=once et premier acces
```

Si OK, le plugin + YubiKey fonctionnent.

Remettre la clé fichier (elle restera recipient valide, pour DR scénarios) :
```text
mv /root/.config/sops/age/keys.txt{.disabled,}
```

## Phase 6 — Tester le reboot

```text
reboot
# apres reboot, verifier :
ls /run/homelab/.env              # doit exister
systemctl status homelab-unseal   # active (exited)
```

**Important** : `homelab-unseal.service` tourne comme root au boot. La YubiKey doit être INSEREE au boot, sinon l'unseal échoué (avec --pin-policy once, l'unseal script ne peut pas saisir de PIN).

**Recommandation** : garder la clé fichier comme fallback pour homelab-unseal, et reserver la YubiKey pour les opérations manuelles (sops edit, seal, updatekeys).

---

## Rotation de la clé

Tous les ~12 mois, générer une nouvelle identité YubiKey :
1. `age-plugin-yubikey --generate --slot 2 ...` (autre slot)
2. Ajouter le nouveau recipient dans `.sops.yaml`
3. `sops updatekeys` partout
4. Tester déchiffrement avec nouvelle clé
5. Retirer l'ancien recipient de `.sops.yaml`
6. `sops updatekeys` partout

## Revocation d'urgence

Si YubiKey perdue/compromise :
1. Retirer immédiatement le recipient `age1yubikey1...` compromis de `.sops.yaml`
2. `sops updatekeys` sur tous les fichiers (force le re-encrypt DEK)
3. Revoquer le slot PIV : `ykman piv keys delete <slot>` (si tu recuperes la clé)
4. Générer un nouveau slot (cf. Phase 2)
