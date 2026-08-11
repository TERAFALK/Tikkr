#!/usr/bin/env bash
# Rensar bort företag som testkörningar lämnat efter sig i appens databas.
#
# Behövs bara en gång, för data som blev kvar innan testerna fick en egen
# databas. Framöver rör testerna aldrig den här databasen.
#
# Visar vad som skulle raderas och frågar innan något händer.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; . ./.env; set +a

DB_USER="${POSTGRES_USER:-tikkr}"
DB_NAME="${POSTGRES_DB:-tikkr}"

# Namnen som testfilerna använder. Ett riktigt kundföretag heter inte så här.
WHERE="name IN ('Stämpeltest AB','Rapporttest AB','Nybygget AB','Grannen AB','Nykomlingen AB','Testbolag A','Testbolag B') OR name LIKE 'Testbolag %' OR name LIKE 'Anvandartest %'"

echo "Företag som skulle raderas:"
echo
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" \
  -c "SELECT name, created_at FROM companies WHERE $WHERE ORDER BY created_at;"

echo
echo "Allt som hör till dem försvinner också: anställda, ordrar och stämplingar."
read -r -p "Skriv JA för att radera: " CONFIRM

if [ "$CONFIRM" != "JA" ]; then
  echo "Avbrutet. Ingenting har ändrats."
  exit 1
fi

docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" \
  -c "DELETE FROM companies WHERE $WHERE;"

echo "Klart."
