#!/usr/bin/env bash
# Compare les URLs du build Docusaurus a celles archivees depuis le build MkDocs
# de reference (phase 0 de la migration). Le diff DOIT etre vide avant de fusionner.
set -euo pipefail

ref="${1:-.migration-urls-avant.txt}"
build_dir="${2:-build}"

[ -f "$ref" ] || { echo "Reference absente : $ref" >&2; exit 2; }
[ -d "$build_dir" ] || { echo "Build absent : $build_dir" >&2; exit 2; }

# CE SCRIPT NE PROUVE RIEN SUR UN BUILD QUI A ECHOUE — a toujours enchainer
# avec `&&` derriere le build :
#     bun run build && scripts/compare-urls.sh
#
# Constate le 2026-08-26 : Docusaurus ECRIT tout le HTML puis valide les liens en
# dernier. Un build tombe sur `onBrokenAnchors: throw` laisse donc un `build/`
# complet, et ce script a rendu « OK — 57 URLs identiques » sur un build en
# echec. Un garde-fou qui passe sur un echec ne garde rien.
#
# Le controle ci-dessous n'attrape que le cas « build plus vieux que les
# sources » ; il ne peut pas detecter un build en echec. Seul le code de retour
# du build le peut.
newer=$(find docs docusaurus.config.js sidebars.js -newer "$build_dir" 2>/dev/null | head -1)
if [ -n "$newer" ]; then
  echo "ECHEC — $build_dir est plus vieux que les sources (ex: $newer)." >&2
  echo "        Rebuild avant de comparer." >&2
  exit 3
fi

apres=$(mktemp)
trap 'rm -f "$apres"' EXIT
find "$build_dir" -name '*.html' | sed "s|^$build_dir||; s|/index\.html$|/|" | sort > "$apres"

if diff -u "$ref" "$apres"; then
  echo "OK — $(wc -l < "$ref") URLs identiques."
else
  echo
  echo "ECHEC — l'ensemble des URLs a change. '-' = perdue, '+' = apparue." >&2
  exit 1
fi
