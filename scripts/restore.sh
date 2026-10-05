#!/usr/bin/env bash
# Läser tillbaka en säkerhetskopia.
#
# ÖVERSKRIVER hela databasen med innehållet i backupfilen. All data som kommit
# in efter att kopian togs försvinner. Kör bara om du menar det.
#
# Använd även för att ÖVA: läs tillbaka en kopia i en testmiljö då och då, så
# du vet att backuperna faktiskt fungerar innan du behöver dem på riktigt.
#
#   ./scripts/restore.sh backups/tikkr_2026-08-10_0300.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Användning: ./scripts/restore.sh <backupfil.sql.gz>"
  echo
  echo "Tillgängliga kopior:"
  ls -lh backups/*.sql.gz 2>/dev/null || echo "  (inga hittade)"
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

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

# Appen startas igen även om återläsningen misslyckas. Databasen är då
# orörd — se nästa stycke — och kunderna ska inte stå utan system för att
# en kopia var trasig.
trap 'echo "Startar appen igen..."; docker compose start app' EXIT

# ON_ERROR_STOP och --single-transaction: allt eller inget. Utan dem fortsatte
# psql förbi varje fel, och en trasig kopia gav en halvt återläst databas som
# såg lyckad ut.
echo "Läser tillbaka..."
if ! gunzip -c "$FILE" | docker compose exec -T db psql \
  -v ON_ERROR_STOP=1 --single-transaction --quiet \
  -U "${POSTGRES_USER:-tikkr}" \
  -d "${POSTGRES_DB:-tikkr}" >/dev/null; then
  echo
  echo "ÅTERLÄSNINGEN MISSLYCKADES. Databasen är oförändrad."
  exit 1
fi

echo "Återläst på $(( $(date +%s) - START )) sekunder."

echo "Klart. Kontrollera: curl -s localhost:${APP_PORT:-3000}/api/health"
