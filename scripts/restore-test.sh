#!/usr/bin/env bash
# Övar återläsning, utan att röra den riktiga databasen.
#
# En backup ingen provat att läsa tillbaka är bara en förhoppning. Det här
# skriptet läser in en kopia i en TILLFÄLLIG Postgres-container, räknar raderna
# och tar bort containern igen. Appen och den skarpa databasen märker ingenting.
#
# Körs på produktionsservern, så att kunddata aldrig lämnar den. Labbet har
# aldrig riktig kunddata, och ska inte få det för en övnings skull.
#
#   ./scripts/restore-test.sh                          senaste lokala kopian
#   ./scripts/restore-test.sh backups/tikkr_....sql.gz en bestämd kopia
#
# Övar du på en kopia ur det krypterade målet, hämta den först:
#   rclone copy tikkr-krypterad: ./backups --include 'tikkr_*.sql.gz' --max-age 2d
set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-$(ls -t backups/tikkr_*.sql.gz 2>/dev/null | head -1 || true)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Hittar ingen kopia. Ange en fil."; exit 1; }

# shellcheck disable=SC1091
set -a; . ./.env; set +a
DB_USER="${POSTGRES_USER:-tikkr}"
DB_NAME="${POSTGRES_DB:-tikkr}"
NAME="tikkr-restore-test"

# Samma användare och databasnamn som den riktiga, eftersom dumpen sätter
# ägare på tabellerna. Lösenordet spelar ingen roll: containern publicerar
# ingen port och lever i några minuter.
docker rm -f "$NAME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

echo "Startar en tillfällig databas..."
docker run -d --name "$NAME" \
  -e POSTGRES_USER="$DB_USER" -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_PASSWORD=ovning postgres:17-alpine >/dev/null

until docker exec "$NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null; do
  sleep 1
done
# pg_isready svarar redan under initdb; vänta på att den slutliga servern tar emot.
sleep 3
until docker exec "$NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null; do
  sleep 1
done

echo "Läser in $FILE ..."
START="$(date +%s)"
gunzip -c "$FILE" | docker exec -i "$NAME" psql \
  -v ON_ERROR_STOP=1 --single-transaction --quiet \
  -U "$DB_USER" -d "$DB_NAME" >/dev/null
SECONDS_TAKEN=$(( $(date +%s) - START ))

count() {
  docker exec "$NAME" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM $1"
}

echo
echo "Återläst på $SECONDS_TAKEN sekunder. Innehåll:"
echo "  företag:      $(count companies)"
echo "  anställda:    $(count employees)"
echo "  stämplingar:  $(count time_entries)"
echo "  senaste stämpling: $(docker exec "$NAME" psql -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT max(clock_in_at) FROM time_entries')"
echo
echo "Anteckna tiden — den är svaret på \"hur länge står vi still\"."
echo "Den tillfälliga databasen tas bort nu."
