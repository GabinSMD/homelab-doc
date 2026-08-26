#!/usr/bin/env python3
"""Garde-fou de fraicheur : interdit les termes retires dans les pages qu'on SUIT.

    scripts/check-doc-fraicheur.py

Code 1 si une page operationnelle reference encore quelque chose de retire.

POURQUOI CE CONTROLE EXISTE
---------------------------
Le 2026-08-26, `operations/break-glass.mdx` — la page qu'on suit quand tout a
brule — donnait cinq fois une commande de restauration exportant
`B2_ACCOUNT_ID`, trois mois et demi apres la migration vers Cloudflare R2. Elle
etait donc incapable de s'authentifier, et personne ne l'avait vu : **aucun chemin
de code n'execute un runbook.**

L'information juste existait pourtant deja dans le depot — `r2-migration.md`
documentait noir sur blanc le passage a `AWS_ACCESS_KEY_ID`. Ce n'etait pas un
probleme de redaction mais de propagation. Ce script est la propagation.

CE QU'IL NE FAIT PAS
--------------------
Il ne juge pas l'exactitude technique d'une page. Il ne verifie qu'une chose :
qu'un terme dont on SAIT qu'il est retire n'apparait pas la ou un lecteur le
prendrait pour une instruction.

Le piege a eviter en l'etendant : un `grep` naif remonte surtout des references
historiques legitimes. C'est pourquoi chaque terme porte une liste blanche
explicite, et pourquoi elle est justifiee ligne par ligne.
"""

from __future__ import annotations

import pathlib
import re
import sys

# Les pages qu'on suit en situation. Le reste de `docs/` (specs, decisions,
# roadmaps, post-mortems) a le droit de parler du passe : c'est son role.
SURVEILLE = ("docs/operations/", "docs/guides/", "docs/services/", "docs/architecture/")

RETIRES = [
    {
        "motif": r"B2_ACCOUNT_ID|B2_ACCOUNT_KEY|\bb2:[a-z0-9-]+:",
        "quoi": "identifiants ou URL Backblaze B2",
        "retire": "2026-05-11 (migration vers Cloudflare R2)",
        "a_la_place": "set -a; . /root/.restic-env; set +a  (n'ecris jamais la liste des variables en dur)",
        "autorise": {
            # Documente la migration : la comparaison B2 -> R2 est son sujet.
            "docs/operations/r2-migration.md",
            # Post-mortem du depassement de quota B2, anterieur a la migration.
            "docs/operations/b2-cap-exceeded.md",
            # Porte deja la note « B2 decommissionne le 2026-05-29 ».
            "docs/operations/dr-drill-scenario-1.md",
            # L'encadre de correction cite l'ancienne commande pour l'expliquer.
            "docs/operations/break-glass.mdx",
        },
    },
    {
        "motif": r"mkdocs build|mkdocs\.yml|MkDocs Material",
        "quoi": "construction du site par MkDocs",
        "retire": "2026-08-26 (migration vers Docusaurus)",
        "a_la_place": "bun run build",
        "autorise": set(),
    },
    {
        "motif": r"fish\.tail|fish\.service|\bunit fish\b",
        "quoi": "l'agent SRE sous son ancien nom « fish »",
        "retire": "2026-07-06 (renomme sucre)",
        "a_la_place": "sucre — et note qu'il est lui-meme arrete depuis le 2026-08-25",
        "autorise": set(),
    },
]

FENCE = re.compile(r"^\s*(```|~~~)")


def main() -> int:
    if not pathlib.Path("docs").is_dir():
        print("docs/ introuvable — lancer depuis la racine du depot.", file=sys.stderr)
        return 2

    pages = [
        p
        for p in [*pathlib.Path("docs").rglob("*.md"), *pathlib.Path("docs").rglob("*.mdx")]
        if p.as_posix().startswith(SURVEILLE)
    ]

    echecs = 0
    for regle in RETIRES:
        rx = re.compile(regle["motif"])
        for p in sorted(pages):
            rel = p.as_posix()
            if rel in regle["autorise"]:
                continue
            for n, ligne in enumerate(p.read_text(encoding="utf-8").split("\n"), 1):
                if rx.search(ligne):
                    if echecs == 0:
                        print("ECHEC — des pages operationnelles referencent du retire.\n")
                    echecs += 1
                    print(f"  {rel}:{n}")
                    print(f"     {ligne.strip()[:100]}")
                    print(f"     {regle['quoi']}, retire le {regle['retire']}")
                    print(f"     a la place : {regle['a_la_place']}")
                    print(f"     si c'est un rappel historique legitime, ajoute ce fichier"
                          f" a la liste blanche du motif, AVEC sa justification.\n")

    if echecs:
        print(f"{echecs} occurrence(s). Voir scripts/check-doc-fraicheur.py.")
        return 1

    print(f"OK — {len(pages)} pages operationnelles, aucun terme retire.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
