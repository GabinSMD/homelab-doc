#!/usr/bin/env python3
"""Phase 3 : onglets `pymdownx.tabbed` -> <Tabs>/<TabItem> de Docusaurus.

    scripts/convert-tabs.py --dry-run docs/architecture/reseau.md
    scripts/convert-tabs.py docs/architecture/reseau.md docs/operations/break-glass.md

A lancer AVANT `convert-admonitions.py` sur ces fichiers : la des-indentation des
corps d'onglet ramene au niveau zero l'admonition imbriquee de break-glass.md
(ligne 157), que le convertisseur d'admonitions saura alors traiter.

Le fichier doit finir en `.mdx` : les imports `@theme/Tabs` sont du JSX, donc
inutilisables en mode CommonMark. Le renommage ne change aucune URL — Docusaurus
route `.md` et `.mdx` vers la meme adresse.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys
import unicodedata

TAB = re.compile(r'^(?P<ind>[ \t]*)=== +"(?P<title>.*)"[ \t]*$')
IMPORTS = (
    "import Tabs from '@theme/Tabs';\n"
    "import TabItem from '@theme/TabItem';\n"
)


def slug(title: str) -> str:
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "onglet"


def dedent(body: list[str]) -> list[str]:
    widths = [len(l) - len(l.lstrip()) for l in body if l.strip()]
    if not widths:
        return body
    cut = min(widths)
    return [l[cut:] if l.strip() else "" for l in body]


def convert(text: str) -> tuple[str, int]:
    lines = text.split("\n")
    out: list[str] = []
    groups = 0
    i = 0

    while i < len(lines):
        m = TAB.match(lines[i])
        if not m:
            out.append(lines[i])
            i += 1
            continue

        ind = m.group("ind")
        base = len(ind)
        tabs: list[tuple[str, list[str]]] = []

        # Un groupe = des blocs `=== "…"` consecutifs au meme niveau, separes
        # seulement par des lignes vides.
        while i < len(lines):
            m = TAB.match(lines[i])
            if not m or len(m.group("ind")) != base:
                break
            title = m.group("title")
            i += 1
            body: list[str] = []
            while i < len(lines):
                nxt = lines[i]
                if not nxt.strip():
                    body.append("")
                elif len(nxt) - len(nxt.lstrip()) > base:
                    body.append(nxt)
                else:
                    break
                i += 1
            while body and not body[-1].strip():
                body.pop()
            while body and not body[0].strip():
                body.pop(0)
            tabs.append((title, dedent(body)))

        out.append(f"{ind}<Tabs>")
        for title, body in tabs:
            out.append(f'{ind}<TabItem value="{slug(title)}" label="{title}">')
            out.append("")
            out.extend(ind + b if b else "" for b in body)
            out.append("")
            out.append(f"{ind}</TabItem>")
        out.append(f"{ind}</Tabs>")
        groups += 1

    return "\n".join(out), groups


def add_imports(text: str) -> str:
    if "@theme/Tabs" in text:
        return text
    lines = text.split("\n")
    at = 0
    if lines and lines[0].strip() == "---":  # front matter
        for k in range(1, len(lines)):
            if lines[k].strip() == "---":
                at = k + 1
                break
    while at < len(lines) and not lines[at].strip():
        at += 1
    return "\n".join(lines[:at] + [IMPORTS.rstrip(), ""] + lines[at:])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("files", nargs="+")
    args = ap.parse_args()

    for f in args.files:
        p = pathlib.Path(f)
        if not p.is_file():
            print(f"introuvable : {f}", file=sys.stderr)
            return 2
        before = p.read_text(encoding="utf-8")
        after, groups = convert(before)
        if groups:
            after = add_imports(after)
        if after == before:
            print(f"{f} : rien a faire")
            continue
        if args.dry_run:
            import difflib

            for d in list(
                difflib.unified_diff(
                    before.split("\n"), after.split("\n"), lineterm="", n=1
                )
            )[2:]:
                print(d)
            print(f"\n{f} : {groups} groupe(s) d'onglets")
        else:
            p.write_text(after, encoding="utf-8")
            print(f"{f} : {groups} groupe(s) d'onglets converti(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
