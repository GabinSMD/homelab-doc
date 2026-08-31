# CLAUDE.md — homelab-doc

Repo **public** : documentation Docusaurus du homelab (migre de MkDocs le 26/08/2026 ; build `bun run build`), publiee sur https://homelab.gabin-simond.fr via GitHub Actions -> GitHub Pages (CNAME). Aucun Cloudflare Pages dans le circuit.

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
git push origin main && git push github main  # c'est l'etat de GitHub qui fait le site
# Si le second push est rejete par `cannot lock ref ... is at X but expected Y`,
# ce n'est PAS un echec : GitHub a deja le commit. Verifier, ne pas forcer :
#   git ls-remote github -h refs/heads/main
```

## Commits

Convention : `docs(categorie): verbe court` — ex `docs(operations): add DR drill scenario 1`

## Memoires communes au projet

Cf. `/root/.claude/projects/-root/memory/` et `/mnt/ssd/config/CLAUDE.md` pour le contexte complet du homelab.
