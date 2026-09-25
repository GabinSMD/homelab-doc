# CLAUDE.md — homelab-doc

Repo **public** : documentation Docusaurus du homelab (migre de MkDocs le 26/08/2026 ; voir « Construire le site » plus bas), publiee sur https://homelab.gabin-simond.fr via GitHub Actions -> GitHub Pages (CNAME). Aucun Cloudflare Pages dans le circuit.

## Construire le site

**Ne pas construire localement sans borner la commande.** Le 2026-09-25 a
09:52, une construction Docusaurus sur penny a pousse la charge 15 min a 13.
Le demon `watchdog` redemarre la machine au-dela de 12 : il a attendu 61 s,
puis a coupe tout le homelab — proprement, mais sans preavis. Trois processus
Node suffisent sur un Raspberry Pi 4 a quatre coeurs.

**La CI construit deja le site** (workflow « Deploy Docusaurus to GitHub
Pages »). Une construction locale ne sert qu'a verifier avant de pousser, et
n'est presque jamais necessaire : `onBrokenLinks: 'throw'` fait echouer la CI
en quelques minutes si un lien casse.

Si elle l'est vraiment, la borner :

```bash
systemd-run --scope -p CPUQuota=200% -p MemoryMax=2G nice -n 19 bun run build
```

Deux coeurs sur quatre, 2 Go de plafond : la charge reste sous le seuil et la
machine continue de servir. Une alerte previent desormais a partir de 8, mais
c'est une securite, pas une permission.

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
