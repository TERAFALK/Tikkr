#!/usr/bin/env bash
# Övar återläsning, utan att röra den riktiga databasen.
#
# Läser in en kopia i en TILLFÄLLIG Postgres-container, räknar raderna och tar
# bort containern igen. Appen och den skarpa databasen märker ingenting.
#
# Körs på produktionsservern, så att kunddata aldrig lämnar den.
#
#   ./ops/restore-test.sh                            senaste lokala kopian
#   ./ops/restore-test.sh backups/minapp_....sql.gz  en bestämd kopia
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=lib.sh
. ./ops/lib.sh
ops_load "$PWD"

FILE="${1:-$(ls -t "backups/${BACKUP_PREFIX}"_*.sql.gz 2>/dev/null | head -1 || true)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Hittar ingen kopia. Ange en fil."; exit 1; }

NAME="$APP_SLUG-restore-test"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:17-alpine}"

# Samma användare och databasnamn som den riktiga, eftersom dumpen sätter ägare
# på tabellerna. Lösenordet spelar ingen roll: containern publicerar ingen port
# och lever i några minuter.
docker rm -f "$NAME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

echo "Startar en tillfällig databas..."
docker run -d --name "$NAME" \
  -e POSTGRES_USER="$DB_USER" -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_PASSWORD=ovning "$POSTGRES_IMAGE" >/dev/null

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

sql() {
  docker exec "$NAME" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"
}

count() {
  sql "SELECT count(*) FROM $1"
}

echo
echo "Återläst på $SECONDS_TAKEN sekunder."
echo "  tabeller: $(sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"

if [ -n "${RESTORE_TEST_HOOK:-}" ] && [ -f "$RESTORE_TEST_HOOK" ]; then
  # shellcheck disable=SC1090
  . "$RESTORE_TEST_HOOK"
fi

echo
echo "Anteckna tiden. Den är svaret på \"hur länge står vi still\"."
echo "Den tillfälliga databasen tas bort nu."
