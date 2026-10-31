#!/usr/bin/env bash
# Läser tillbaka en säkerhetskopia.
#
# ÖVERSKRIVER hela databasen med innehållet i backupfilen. All data som kommit in
# efter att kopian togs försvinner. Kör bara om du menar det. För att öva, använd
# ops/restore-test.sh, som inte rör den riktiga databasen.
#
#   ./ops/restore.sh backups/minapp_2026-08-10_0300.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=lib.sh
. ./ops/lib.sh

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Användning: ./ops/restore.sh <backupfil.sql.gz>"
  echo
  echo "Tillgängliga kopior:"
  ls -lh backups/*.sql.gz 2>/dev/null || echo "  (inga hittade)"
  exit 1
fi

ops_load "$PWD"

echo "Detta ERSÄTTER hela databasen med innehållet i:"
echo "  $FILE"
echo
read -r -p "Skriv JA för att fortsätta: " CONFIRM
if [ "$CONFIRM" != "JA" ]; then
  echo "Avbrutet. Ingenting har ändrats."
  exit 1
fi

echo "Stoppar appen så att inget skriver under tiden..."
docker compose stop app

START="$(date +%s)"

# Appen startas igen även om återläsningen misslyckas. Databasen är då orörd, och
# kunderna ska inte stå utan system för att en kopia var trasig.
trap 'echo "Startar appen igen..."; docker compose start app' EXIT

# ON_ERROR_STOP och --single-transaction: allt eller inget. Utan dem fortsätter
# psql förbi varje fel, och en trasig kopia ger en halvt återläst databas som ser
# lyckad ut.
echo "Läser tillbaka..."
if ! gunzip -c "$FILE" | docker compose exec -T db psql \
  -v ON_ERROR_STOP=1 --single-transaction --quiet \
  -U "$DB_USER" \
  -d "$DB_NAME" >/dev/null; then
  echo
  echo "ÅTERLÄSNINGEN MISSLYCKADES. Databasen är oförändrad."
  exit 1
fi

echo "Återläst på $(( $(date +%s) - START )) sekunder."
echo "Klart. Kontrollera: curl -s $HEALTH_URL"
