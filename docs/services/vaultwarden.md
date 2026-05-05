# Vaultwarden

Gestionnaire de mots de passe auto-heberge, compatible avec les clients Bitwarden.

## Acces

| | |
|---|---|
| URL | `https://vault.home.gabin-simond.fr` |
| Host | LXC 102 `vault` sur galahad (192.168.1.32) |
| Image | `vaultwarden/server:latest` (digest pinned) |
| Port interne | 80 |
| Auth | Master password + TOTP (pas de SSO, voir ci-dessous) |

## Pourquoi pas de SSO ?

Vaultwarden conserve intentionnellement son propre master password, sans SSO Authelia.

!!! warning "Dépendance circulaire"
    Si Authelia tombe (RPi crash, SSD deconnecte), tous les services SSO deviennent inaccessibles.
    Si Vaultwarden dépend aussi d'Authelia, on perd l'acces au coffre-fort de mots de passe
    nécessaire pour reparer les autres services.

Vaultwarden est le **filet de sécurité** : il stocké tous les credentials (Authelia, Proxmox, AdGuard, etc.)
et reste accessible même quand le reste est casse.

## Configuration

| Variable | Valeur |
|---|---|
| `DOMAIN` | `https://vault.home.gabin-simond.fr` |
| `SIGNUPS_ALLOWED` | `true` (a désactiver après création du compte) |

## Clients recommandes

- **Extension navigateur** : Bitwarden (Firefox / Chrome)
- **Mobile** : Bitwarden (iOS / Android)
- **Desktop** : Bitwarden Desktop

Configurer l'URL du serveur dans les paramètres du client : `https://vault.home.gabin-simond.fr`

## Données

| | |
|---|---|
| Volume | `vaultwarden-data` |
| Contenu | Base SQLite, clés RSA, attachments |
