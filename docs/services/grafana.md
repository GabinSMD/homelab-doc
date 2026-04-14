# Grafana (logs)

Visualisation des logs centralises (Loki + Alloy). Pas de metriques : c'est [Beszel](index.md) qui s'en occupe, pour eviter le doublon Prometheus + node_exporter.

## Acces

| | |
|---|---|
| URL | `https://logs.home.gabin-simond.fr` |
| Host | LXC 101 `logs` sur lancelot (192.168.1.31) |
| Port interne | 3000 |
| Image | `grafana/grafana:latest` |
| Source compose | `/opt/logs/docker-compose.yml` |
| Versioned | `/mnt/ssd/config/logs/` sur penny |

## Authentification

**100% OIDC Authelia** — pas de compte admin local, pas de login form.

- `GF_AUTH_DISABLE_LOGIN_FORM=true`
- `GF_AUTH_BASIC_ENABLED=false`
- `GF_AUTH_OAUTH_AUTO_LOGIN=true` (redirige direct sur Authelia)
- Role mapping : groupe `admins` dans users_database → `GrafanaAdmin`, sinon `Viewer`
- PKCE S256 requis

Le compte legacy `admin` est desactive dans la DB (`is_disabled=1`, password efface). `gabins` est `is_admin=1` + org Admin.

## Datasources

| Name | Type | URL | UID |
|---|---|---|---|
| Loki | loki | `http://loki:3100` | `loki` |

Provisionnee via `/opt/logs/grafana-provisioning/datasources/loki.yml` avec `uid: loki` pour que les dashboards la trouvent.

## Dashboards

Quatre dashboards provisionnes via `/opt/logs/dashboards/*.json` (read-only), folder Grafana `Homelab`. Tous les KPI stats utilisent `[$__range]` et suivent le selecteur de temps Grafana.

### Homelab Overview (`homelab-overview`)

Le dashboard du matin — 5 secondes pour savoir si tout va bien.

| Ligne | Panneaux |
|---|---|
| KPIs sante | Erreurs, Container restarts, Autoheal, Events SSD |
| KPIs conscience | Logins echoues, Bans fail2ban, Watchtower MAJ, Sessions SSH |
| Graphes | Erreurs par service, Monitoring alerts (homelab_monitor.sh) |
| Logs evenements | MAJ containers (Watchtower), SSD / Power / Certificats TLS |
| Logs erreurs | Erreurs recentes tous services |

### Securite (`auth-security`)

Deep dive quand un signal securite clignote sur l'overview.

| Ligne | Panneaux |
|---|---|
| KPIs | Logins reussis, Logins echoues, Bans fail2ban, Sudo commands |
| Graphes | Authelia logins, fail2ban bans par host, SSH sessions par host, Sudo par host |
| Logs | Authelia echecs + IP, WebAuthn/TOTP, SSH connexions, auditd |

### Trafic (`traefik-access`)

Deep dive sur le trafic HTTP via Traefik.

| Ligne | Panneaux |
|---|---|
| KPIs | Requetes, 4xx, 5xx, Taux erreur |
| Graphes | Codes HTTP par classe (stacked), Volume par service backend |
| Logs | 4xx/5xx recents avec URL |

### Logs Explorer (`logs-explorer`)

Recherche libre avec filtres. Variables : Host, Job, Container, Recherche texte.

| Ligne | Panneaux |
|---|---|
| Graphes | Volume par host, Volume par container, Volume par job |
| Logs | Recherche libre (repond aux filtres variables) |

## Architecture

```mermaid
graph LR
    subgraph "penny / galahad / lancelot"
        Alloy[Grafana Alloy]
    end

    subgraph "LXC 101 logs"
        Loki
        Grafana
    end

    Alloy -->|push| Loki
    Grafana -->|query| Loki
    Browser -->|logs.home...| Traefik
    Traefik -->|OIDC| Authelia
    Traefik -->|forward| Grafana
```

## Sources des logs (Alloy)

| Host | Sources |
|---|---|
| penny | journald, Docker containers, fail2ban, `homelab_monitor.sh` |
| galahad | journald, `/var/log/audit/audit.log`, Proxmox logs, fail2ban |
| lancelot | journald, Proxmox logs, LXC stdout/stderr |

Retention Loki : 30 jours.

## Operations

### Ajouter un dashboard

Depose le JSON dans `/mnt/ssd/config/logs/dashboards/` (source), puis :

```bash
tar czf /tmp/bundle.tar.gz -C /mnt/ssd/config/logs dashboards grafana-provisioning docker-compose.yml
scp /tmp/bundle.tar.gz gabins@100.69.6.13:/tmp/
ssh gabins@100.69.6.13 "sudo pct push 101 /tmp/bundle.tar.gz /tmp/ && \
  sudo pct exec 101 -- bash -c 'cd /opt/logs && tar xzf /tmp/bundle.tar.gz && docker restart grafana'"
```

### Reset du compte admin (en cas d'urgence)

Si Authelia est down ET qu'il faut acceder a Grafana, passer en mode basic temporairement :

```bash
# Dans le LXC 101
docker stop grafana
# Editer /opt/logs/docker-compose.yml :
#   GF_AUTH_DISABLE_LOGIN_FORM: "false"
#   GF_AUTH_BASIC_ENABLED: "true"
#   GF_SECURITY_ADMIN_PASSWORD: "<one-shot>"
docker compose up -d grafana
# Apres intervention : retirer les 3 env vars et redeployer
```

## Credentials

| Element | Stockage |
|---|---|
| Client OIDC `grafana` — secret en clair | Vaultwarden (`Grafana OIDC client (Authelia)`) |
| Client OIDC `grafana` — hash pbkdf2 | `/mnt/ssd/config/authelia/configuration.yml` |
| Admin legacy | **Desactive** (aucun usage) |
