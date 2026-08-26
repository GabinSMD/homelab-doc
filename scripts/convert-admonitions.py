#!/usr/bin/env python3
"""Phase 2 de la migration MkDocs -> Docusaurus : conversion mecanique.

Idempotent : relancer ne change rien, le script ne reconnait que la syntaxe
MkDocs (`!!!`, `???`) et les trois noms d'icones Material.

    scripts/convert-admonitions.py --dry-run   # montre le diff, n'ecrit rien
    scripts/convert-admonitions.py             # applique

CE QUE LE SCRIPT NE FAIT PAS, ET POURQUOI
-----------------------------------------
Le plan de migration annoncait aussi la conversion de `++touche++` (2) et
`==surligne==` (6). Verification faite le 2026-08-26 : **aucune de ces
occurrences n'est du contenu**. Les `==...==` sont toutes dans des blocs de code
— regles udev de `architecture/os.md` (`ATTR{idProduct}=="1156"`), separateurs de
sortie shell de `break-glass.md` et `hardening.md` (`== FIN ==`) — et le reste
vient des exemples de syntaxe du plan lui-meme. Les convertir corromprait des
regles udev. Le compte du plan etait un artefact de grep : rien a faire ici.

Meme correction sur les emoji : le plan comptait « 7 emoji `:xxx:` ». Le grep
generique attrapait `:https:`, `:bucket:`, `:gabin-homelab-backups:` — des
fragments d'URL et de config rclone dans des blocs de code. Les vraies icones
MkDocs Material sont au nombre de 32, et le script les traite par liste blanche
explicite, jamais par motif generique.
"""

from __future__ import annotations

import argparse
import difflib
import pathlib
import re
import sys

DOCS = pathlib.Path("docs")

# Traites a la main en phase 3 : onglets pymdownx.tabbed a reecrire en
# <Tabs>/<TabItem>, et pour break-glass une admonition imbriquee DANS un onglet.
# Les convertir ici livrerait un fichier a moitie migre.
# index.md est reecrit a la main : son bloc <div class="hero" markdown> dependait
# de md_in_html et de extra.css, tous deux abandonnes.
# reseau et break-glass sont passes en .mdx par convert-tabs.py, qui a des-indente
# les corps d'onglet — leurs admonitions sont donc traitables ici.
PHASE_3 = {"docs/index.md"}

# Le plan documente la syntaxe MkDocs : ses exemples doivent rester intacts.
EXCLUDE = PHASE_3 | {"docs/projet/2026-08-25-migration-docusaurus.md"}

FENCE = re.compile(r"^(\s*)(`{3,}|~{3,})")
OPEN = re.compile(
    r"^(?P<ind>[ \t]*)(?P<kind>!!!|\?\?\?\+?)[ \t]+"
    r"(?P<type>[a-z][a-z0-9-]*)"
    r"(?:[ \t]+\"(?P<title>.*)\")?[ \t]*$"
)

# `success` n'existe pas chez Docusaurus.
TYPE_MAP = {"success": "tip"}
KNOWN_TYPES = {"note", "info", "tip", "warning", "danger", "success"}

# Liste blanche : MkDocs Material rend ces trois noms en SVG, Docusaurus n'a pas
# d'equivalent. Remplacement par le caractere litteral.
ICONS = {
    ":material-check:": "✅",
    ":material-close:": "❌",
    ":octicons-alert-16:": "⚠️",
}


def dedent(body: list[str]) -> list[str]:
    """Retire l'indentation commune. Le piege n°2 du plan vit ici : sans ca, le
    corps d'une admonition MkDocs (indente de 4) devient un bloc de code."""
    widths = [len(l) - len(l.lstrip()) for l in body if l.strip()]
    if not widths:
        return body
    cut = min(widths)
    return [l[cut:] if l.strip() else "" for l in body]


def convert(text: str) -> tuple[str, dict[str, int]]:
    lines = text.split("\n")
    out: list[str] = []
    stats = {"admonitions": 0, "details": 0, "icones": 0, "inconnus": 0}
    fence: str | None = None
    i = 0

    while i < len(lines):
        line = lines[i]

        m_fence = FENCE.match(line)
        if m_fence:
            marker = m_fence.group(2)
            if fence is None:
                fence = marker[0] * 3
            elif line.strip().startswith(fence):
                fence = None
            out.append(line)
            i += 1
            continue

        if fence is not None:  # dans un bloc de code : ne toucher a rien
            out.append(line)
            i += 1
            continue

        m = OPEN.match(line)
        if m and m.group("type") in KNOWN_TYPES:
            ind = m.group("ind")
            base = len(ind)
            kind = m.group("kind")
            atype = TYPE_MAP.get(m.group("type"), m.group("type"))
            title = m.group("title") or ""

            # Le corps : lignes vides, ou lignes plus indentees que l'ouverture.
            j = i + 1
            body: list[str] = []
            while j < len(lines):
                nxt = lines[j]
                if not nxt.strip():
                    body.append("")
                elif len(nxt) - len(nxt.lstrip()) > base:
                    body.append(nxt)
                else:
                    break
                j += 1
            # Les lignes vides finales appartiennent au document, pas au bloc.
            while body and not body[-1].strip():
                body.pop()
                j -= 1

            body = dedent(body)
            body = [ind + b if b else "" for b in body]

            if kind == "!!!":
                out.append(f"{ind}:::{atype}[{title}]" if title else f"{ind}:::{atype}")
                out.extend(body)
                out.append(f"{ind}:::")
                stats["admonitions"] += 1
            else:  # ??? ou ???+ : repliable -> <details>
                out.append(f"{ind}<details>")
                out.append(f"{ind}<summary>{title}</summary>")
                out.append("")
                out.extend(body)
                out.append("")
                out.append(f"{ind}</details>")
                stats["details"] += 1

            i = j
            continue

        if m and m.group("type") not in KNOWN_TYPES:
            stats["inconnus"] += 1

        for name, char in ICONS.items():
            if name in line:
                stats["icones"] += line.count(name)
                line = line.replace(name, char)
        out.append(line)
        i += 1

    return "\n".join(out), stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not DOCS.is_dir():
        print("docs/ introuvable — lancer depuis la racine du depot.", file=sys.stderr)
        return 2

    total = {"admonitions": 0, "details": 0, "icones": 0, "inconnus": 0}
    touched = 0

    for path in sorted([*DOCS.rglob("*.md"), *DOCS.rglob("*.mdx")]):
        rel = path.as_posix()
        if rel in EXCLUDE:
            continue
        before = path.read_text(encoding="utf-8")
        after, stats = convert(before)
        if after == before:
            continue
        touched += 1
        for k in total:
            total[k] += stats[k]
        if args.dry_run:
            print(f"\n--- {rel}")
            diff = difflib.unified_diff(
                before.split("\n"), after.split("\n"), lineterm="", n=1
            )
            for d in list(diff)[2:]:
                print(d)
        else:
            path.write_text(after, encoding="utf-8")

    print(
        f"\n{touched} fichiers {'a modifier' if args.dry_run else 'modifies'} — "
        f"{total['admonitions']} admonitions, {total['details']} repliables, "
        f"{total['icones']} icones."
    )
    if total["inconnus"]:
        print(f"ATTENTION : {total['inconnus']} type(s) d'admonition non reconnu(s).")
    print(f"Laisses a la phase 3 : {', '.join(sorted(PHASE_3))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
