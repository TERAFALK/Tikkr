#!/usr/bin/env bash
# Säger till om nyheterna saknas. Stoppar ingenting: en PATCH som kunden inte
# märker behöver ingen post. Se docs/release.md steg 1.
COMMIT="$1"
VERSION="$2"
ENVIRONMENT="$3"

[ "$ENVIRONMENT" = "production" ] || exit 0

# Filen läses in i en variabel först. `git show | grep -q` kan med pipefail
# rapportera fel just när grep hittat raden och slutat läsa.
NOTES="$(git show "$COMMIT:src/lib/release-notes.ts" 2>/dev/null || true)"

case "$NOTES" in
  *"version: \"$VERSION\""*) echo "  Nyheter:   finns för $VERSION" ;;
  *) echo "  Nyheter:   SAKNAS för $VERSION. Kunden ser ingen post om den här versionen." ;;
esac
