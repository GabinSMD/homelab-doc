# Projet

Decisions, planning et contexte du homelab.

## Ce qui vit

| Page | Contenu |
|---|---|
| [Decisions techniques](decisions.md) | ADRs — pourquoi tel choix plutôt qu'un autre |
| [Roadmap](roadmap.md) | Les 4 phases du projet (préparation → consolidation). **C'est la roadmap qui fait foi** pour le matériel ; la sécurité a la [sienne](../securite/roadmap.md). |
| [A propos](about.md) | Philosophie, objectifs, naming des machines |
| [sucre](sucre.md) | L'assistant SRE perso — **arrêté** depuis le 2026-08-25, avec son bilan chiffré |
| [sucre — observabilité](sucre-observability.md) | Comment il voyait le homelab (même statut) |

## Le journal

Les artefacts **datés** vivent dans [`journal/`](journal/2026-08-26-audit-fraicheur-doc.md) :
specs, plans d'activation, rapports, instantanés de roadmap, post-mortems.

La convention, retenue le 2026-08-26 : **on ne réécrit pas un document daté.**
Quand la réalité a bougé, on lui ajoute un encadré qui le dit et on garde le texte
d'origine. C'est ce qui permet de relire une décision avec le contexte qu'elle
avait, au lieu d'une version lissée après coup.

| Date | Artefact |
|---|---|
| 2026-08-26 | [Audit de fraîcheur de la doc](journal/2026-08-26-audit-fraicheur-doc.md) |
| 2026-08-25 | [Migration MkDocs → Docusaurus](journal/2026-08-25-migration-docusaurus.md) |
| 2026-08-15 | [Forgejo source de vérité](journal/2026-08-15-forgejo-source-de-verite.md) |
| 2026-08-15 | [Boîte à outils technique](journal/2026-08-15-boite-a-outils-technique.md) |
| 2026-08-04 | [Homepage : thèmes et fonds](journal/2026-08-04-homepage-themes-fonds-design.md) |
| 2026-08-03 | [Homepage : refonte du dashboard](journal/2026-08-03-homepage-refonte-design.md) |
| 2026-06-11 | [Fiabilisation du drill de restauration](journal/2026-06-11-fiabilisation-drill-restauration.md) |
| 2026-05-11 | [Migration vers Cloudflare R2](journal/2026-05-11-migration-r2.md) |
| 2026-05-11 | [Roadmap consolidée](journal/2026-05-11-roadmap-consolidee.md) — instantané, pas la roadmap vivante |
| 2026-05-10 | [Quota B2 dépassé](journal/2026-05-10-b2-cap-exceeded.md) — l'incident qui a déclenché la migration |
| 2026-04-19 | [Egress firewall phase 2](journal/2026-04-19-egress-phase2.md) — plan d'activation, déployé depuis |
