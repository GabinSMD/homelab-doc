# Vaultwarden

Gestionnaire de mots de passe auto-heberge, compatible avec les clients Bitwarden.

## Acces

| | |
|---|---|
| URL | `https://vault.home.gabin-simond.fr` |
| Image | `vaultwarden/server:latest` |
| Port interne | 80 |

## Pourquoi pas de SSO ?

Vaultwarden conserve intentionnellement son propre master password, sans SSO Authelia.

!!! warning "Dependance circulaire"
    Si Authelia tombe (RPi crash, SSD deconnecte), tous les services SSO deviennent inaccessibles.
    Si Vaultwarden depend aussi d'Authelia, on perd l'acces au coffre-fort de mots de passe
    necessaire pour reparer les autres services.

Vaultwarden est le **filet de securite** : il stocke tous les credentials (Authelia, Proxmox, AdGuard, etc.)
et reste accessible meme quand le reste est casse.

## Configuration

| Variable | Valeur |
|---|---|
| `DOMAIN` | `https://vault.home.gabin-simond.fr` |
| `SIGNUPS_ALLOWED` | `true` (a desactiver apres creation du compte) |

## Clients recommandes

- **Extension navigateur** : Bitwarden (Firefox / Chrome)
- **Mobile** : Bitwarden (iOS / Android)
- **Desktop** : Bitwarden Desktop

Configurer l'URL du serveur dans les parametres du client : `https://vault.home.gabin-simond.fr`

## Donnees

| | |
|---|---|
| Volume | `vaultwarden-data` |
| Contenu | Base SQLite, cles RSA, attachments |
