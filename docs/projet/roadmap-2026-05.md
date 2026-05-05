# Roadmap consolidee 2026-05

> **Vue unifiée post-Phase 2 egress firewall** (2026-05-05). Synthese de [projet/roadmap.md](roadmap.md) (phases hardware), [sécurité/roadmap.md](../securite/roadmap.md) (P1-P4 sec), [fish.md roadmap](fish.md#roadmap), prioritisee par impact/effort/blockers.

## TL;DR

Le homelab est **dans le meilleur état qu'il ait jamais été** après 3 semaines de chantiers. Plus rien d'urgent. 4 items realistes a planifier sur les 1-3 mois, le reste est bloque (hardware/demenagement) ou hors-scope.

## Tier 1 — A faire dans le mois (vrais gaps)

| # | Item | Effort | Pourquoi |
|---|------|--------|----------|
| 1 | **UPS achat + setup NUT** (~80€ APC Back-UPS 700VA) | 1 weekend | Vrai trou reliability — coupure courant 5s = corruption eMMC ZimaBoard potentielle. Le seul gap structurel encore present. |
| 2 | **DR drill from cold** | 1/2 journee user | Seule preuve reelle que la chain restore B2+sops marche end-to-end. Memory `project_security_audit_20260419` : "Restore backup test reel — Non audite". |
| 3 | **TFA root@pam Proxmox** | 5 min UI user | MEDIUM finding ouvert depuis audit 2026-04-19. Defense-in-depth pour root cluster. |
| 4 | **Switch 8p manageable config** | 30 min UI user | Switch achete + plug, mais aucune config (admin password, IP statique, firmware update). Setup initial L2 dumb suffit pour aujourd'hui. |

**Total Tier 1** : ~1 weekend cumulé pour les 4 items.

## Tier 2 — Quality of life (1-3 mois)

| # | Item | Effort | Pourquoi |
|---|------|--------|----------|
| 5 | **Renovate sur homelab-config** | 30 min | Auto-PR pour deps Python fish (`anthropic`, `PyGithub`, `aiohttp`). Aujourd'hui `uv.lock` jamais bumpe = risk CVE silencieux. |
| 6 | **CI/CD GitHub Actions** sur homelab-config | 1h | pytest fish + ruff + bash -n + secret scan avant merge. Aujourd'hui push direct main = no quality gate. |
| 7 | **Synthetic monitoring externe** (healthchecks par service public) | 30 min | Si Cloudflare/DNS cassent, fish observé que ton réseau interne. Healthchecks ping `homelab.gabin-simond.fr` et alerte si DNS/CF down. |
| 8 | **SMTP migration port 25 → 587 auth** (PVE postfix) | 1h | Supprime risk spam relay si compromission. Whitelist port 25 outbound est l'exception un peu fragile de Phase 2. |
| 9 | **Fish Grafana dashboard** | 1-2h | Observabilite du compound engine : proposals/jour, approval rate, success rate, cost trend, latency classifier→exec. |

## Tier 3 — Selon usage perso ou après soak fish

| # | Item | Effort | Trigger |
|---|------|--------|---------|
| 10 | **Fish soak reeval** semaine 8 (mi-juin 2026) | observation | Decision data-driven : si signal/noise > 50% APRÈS filtres → continue invest. Sinon → pivot Hybrid (Alertmanager + LLM réservé UNKNOWN). |
| 11 | **Replicate Fish Option B** sur galahad+lancelot | 1 weekend | Couverture cluster complete. Bloque par soak (ne pas investir avant validation valeur fish). |
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
- [Egress firewall future iterations](../securite/egress-phase2-plan.md) — IP-set Cloudflare/B2/etc si threat model evolue (maintenance pesante)

## Vision long terme (12+ mois)

Le homelab actuel **suffit largement** pour usage perso/familial. Les vrais next-tier-up ne sont pas techniques mais lifestyle :
- Migration domicile principal (Phase 2-4) → 6-12 mois
- Hardware consolidation (luther + ZFS) → quand budget + besoin computing intensif (e.g. Ollama serieux, Immich AI features)
- Network segmentation IoT/devices via VLANs → quand devices IoT s'accumulent

## Process

Cette roadmap doit être **revue tous les 3 mois** (next : 2026-08-05). Chaque revue :
1. Mark items completes après verif live
2. Repromote items Tier 3+ qui sont devenus pertinents
3. Sunset items qui ne valent plus la peine
4. Capture nouveaux items qui ont emerge des incidents/decouvertes
