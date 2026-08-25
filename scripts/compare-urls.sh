#!/usr/bin/env bash
# Compare les URLs du build Docusaurus a celles archivees depuis le build MkDocs
# de reference (phase 0 de la migration). Le diff DOIT etre vide avant de fusionner.
set -euo pipefail

ref="${1:-.migration-urls-avant.txt}"
build_dir="${2:-build}"

[ -f "$ref" ] || { echo "Reference absente : $ref" >&2; exit 2; }
[ -d "$build_dir" ] || { echo "Build absent : $build_dir" >&2; exit 2; }

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
