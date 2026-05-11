# Roadmap consolidee 2026-05

> **Vue unifiée post-session 2026-05-11** (migration R2 + SMTP submission + TFA + cleanup). Synthese de [projet/roadmap.md](roadmap.md) (phases hardware), [sécurité/roadmap.md](../securite/roadmap.md) (P1-P4 sec), [fish.md roadmap](fish.md#roadmap), prioritisee par impact/effort/blockers.

## TL;DR

Le homelab est **production-grade**. 0 finding audit ouvert. Tous les items "vrais gaps" software ont été fermés le 2026-05-11. Restent : **UPS** (hardware achat), **DR drill** (validation), **switch L3 features futur**, **Phase 2-4 hardware bloqué déménagement**, et items **Tier 3 nice-to-have**.

## Tier 1 — A faire dans le mois (vrais gaps)

| # | Item | Effort | Statut |
|---|------|--------|--------|
| 1 | **UPS achat + setup NUT** (~80€ APC Back-UPS 700VA) | 1 weekend | 🔴 **ouvert** — coupure courant = risque corruption eMMC ZimaBoard. Seul gap structurel encore présent. |
| 2 | **DR drill from cold** | 1/2 journee user | 🔴 **ouvert** — encore + critique depuis migration R2 fraîche. Seule preuve réelle que la chain restore marche end-to-end. |
| 3 | ~~**TFA root@pam Proxmox**~~ | ~~5 min UI~~ | ✅ **DONE 2026-05-11** — WebAuthn YK1 + YK2 + TOTP + Recovery Keys, cluster-wide via pmxcfs |
| 4 | **Switch 8p manageable config** | 30 min UI user | ✅ **Baseline DONE 2026-05-11** — admin password + static IP 192.168.1.2 + DNS aligné. Reste firmware + port labels (cosmétique). |

## Tier 2 — Quality of life (1-3 mois)

| # | Item | Effort | Statut |
|---|------|--------|--------|
| 5 | ~~Renovate sur homelab-config~~ | ~~30 min~~ | ✅ DONE (commit `59ca114`) |
| 6 | ~~CI/CD GitHub Actions~~ | ~~1h~~ | ✅ DONE (ci.yml : fish ruff+mypy+pytest, scripts shellcheck, secret scan, yaml lint) |
| 7 | ~~Synthetic monitoring externe~~ | ~~30 min~~ | ✅ DONE (healthchecks.io heartbeat) |
| 8 | ~~**SMTP migration port 25 → 587 auth**~~ | ~~1h~~ | ✅ **DONE 2026-05-11** — Postfix → smtp.protonmail.ch:587, port 25 outbound fermé sur PVE nodes |
| 9 | ~~Fish Grafana dashboard~~ | ~~1-2h~~ | ✅ DONE (commit `ac85806` "fish — SRE activity") |

## Tier 3 — Selon usage perso ou après soak fish

| # | Item | Effort | Trigger |
|---|------|--------|---------|
| 10 | **Fish soak reeval** semaine 8 (mi-juin 2026) | observation | Decision data-driven : si signal/noise > 50% APRÈS filtres → continue invest. Sinon → pivot Hybrid (Alertmanager + LLM réservé UNKNOWN). |
| 11 | **Replicate Fish Option B** sur galahad+lancelot | 1 weekend | Couverture cluster complète. Bloque par soak (ne pas investir avant validation valeur fish). |
| 12 | **Immich** self-hosted Google Photos | 1 weekend | Si tu veux exit Google Photos. Pas de la sec, juste use-case nouveau. |
| 13 | **Paperless-ngx** OCR documents | 1 weekend | Si tu archives factures/papiers perso et veux exit Dropbox/Drive. |
| 14 | **Trivy schedule** vuln scan images | 30 min | Hebdo, push results dans Loki ou ntfy si CRITIQUE. Hardening avance. |
| 15 | **AIDE/Tripwire** file integrity | 1h | Paranoia level — detect intrusion via modif `/etc /usr`. Pas urgent home threat model. |

## Tier 4 — Bloque hardware / demenagement (Phase 2-4)

### Phase 2 — Avant emmenagement (achat hardware)

- Appliance OPNsense (~120€)
- Switch 2.5GbE manageable 16+ ports (switch coeur)
- APs WiFi VLAN-capable
- Patch panel Cat 8 + coffret mural/baie 6U

### Phase 3 — Installation maison

- Coffret technique
- VLANs + OPNsense en prod
- Freebox bridge mode
- APs WiFi (1 SSID/VLAN)

### Phase 4 — Consolidation

- Minisforum N5 Max "luther" (3eme node Proxmox)
- ZFS mirror → debloque `vzdump --mode snapshot` → fin des PBS backup window whitelists
- PBS sur ZimaBoard → NAS Minisforum
- Ollama local sur luther = backup LLM fish quand budget Claude API serre
- IDS réseau (Suricata) post-OPNsense

## Tier 5 — Decisions documentées (skip ou defere)

- **Chiffrement au repos ZFS** — SKIP documenté (modèle de menace homelab domicile ne le justifie pas, casse boot unattended)
- **Mot de passe GRUB** — Defere (risque lock boot remote >> gain marginal)
- **Bastion SSH LXC** — Tailscale SSH couvre déjà 80%, faible valeur ajoutee
- **Kubernetes / Nomad** — overkill homelab, Docker compose suffit
- **NixOS** — learning curve trop steep vs benefit pour usage perso

## Items hors-roadmap mais voir aussi

- [Fish v3 plans](fish.md#roadmap) (multi-step reasoning, learning loop, dynamic args, pivot Hybrid) — decision post-soak semaine 8
- [Egress firewall future itérations](../securite/egress-phase2-plan.md) — IP-set Cloudflare/R2 si threat model évolué (maintenance pesante)
- [b2-cap-exceeded.md](../operations/b2-cap-exceeded.md) — incident 2026-05-11 (résolu via migration R2)
- [r2-migration.md](../operations/r2-migration.md) — runbook migration R2 cloud backups

## Cleanup post-migration R2 (à faire dans 1-2 semaines)

Items "dette" laissée pour validation de R2 sur la durée :

- Retirer `[b2]` block de `/root/.config/rclone/rclone.conf` (penny)
- Supprimer le bucket B2 dans dashboard Backblaze (post-J+7 stable R2)
- Retirer `check_b2_cap()` de `homelab_monitor.sh` (skip silencieux maintenant, mais code mort)
- Update `b2-cap-exceeded.md` header : marquer "RÉSOLU 2026-05-11 via migration R2"
- Update `decisions.md` : documenter le choix R2 over B2 (transaction caps mensuels vs journaliers, egress free)

## Vision long terme (12+ mois)

Le homelab actuel **suffit largement** pour usage perso/familial. Les vrais next-tier-up ne sont pas techniques mais lifestyle :
- Migration domicile principal (Phase 2-4) → 6-12 mois
- Hardware consolidation (luther + ZFS) → quand budget + besoin computing intensif (e.g. Ollama serieux, Immich AI features)
- Network segmentation IoT/devices via VLANs → quand devices IoT s'accumulent

## Process

Cette roadmap doit être **revue tous les 3 mois** (next : 2026-08-11). Chaque revue :
1. Mark items complètes après verif live
2. Repromote items Tier 3+ qui sont devenus pertinents
3. Sunset items qui ne valent plus la peine
4. Capture nouveaux items qui ont emerge des incidents/decouvertes
