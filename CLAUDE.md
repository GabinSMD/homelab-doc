# CLAUDE.md — homelab-doc

Repo **public** : documentation MkDocs du homelab, publiee sur https://homelab.gabin-simond.fr (deploy via GitHub Actions vers Cloudflare Pages).

## Contenu

```
docs/
├── architecture/   # hardware, OS, reseau, design cible
├── guides/         # pas-a-pas reproductibles
├── operations/     # runbooks (monitoring, backups, break-glass, DR drills)
├── projet/         # decisions, roadmap, about
├── securite/       # politique, hardening, comptes
└── services/       # fiche par service
```

## Convention

Ce repo est **public** : aucune information sensible, aucun secret, aucun IP interne specifique qui ne soit deja sur le domaine public.

Contrepartie privee : `GabinSMD/homelab-config` (clone local : `/mnt/ssd/config/`) contient les fichiers lus au runtime par la Pi (`docker/`, `authelia/`, `crowdsec/`, secrets sops, etc.).

**Regle d'or** quand on ajoute un fichier :
- Decrit un POURQUOI, un pas-a-pas, une architecture → ici (`homelab-doc`)
- Lu au runtime par la Pi → `homelab-config`

## Workflow typique

```
cd /mnt/ssd/homelab-doc
# editer docs/...
git add docs/
git commit -m "docs(scope): ..."
git push  # declenche GitHub Actions deploy vers Cloudflare Pages
```

## Commits

Convention : `docs(categorie): verbe court` — ex `docs(operations): add DR drill scenario 1`

## Memoires communes au projet

Cf. `/root/.claude/projects/-root/memory/` et `/mnt/ssd/config/CLAUDE.md` pour le contexte complet du homelab.
