#!/usr/bin/env bash
# Kör de automatiska testerna mot den kod som ligger i mappen just nu.
#
# Testerna kör mot en EGEN databas, skild från appens. Skälet: de skapar och
# raderar företag hela tiden, och en avbruten körning lämnar rader kvar. Låg de
# i samma databas skulle "Rapporttest AB" dyka upp bland riktiga kunder i
# plattformspanelen — och en testkörning skulle kunna radera något på riktigt.
#
# Koden monteras in istället för att bakas in, så testerna alltid ser din
# senaste ändring utan att imagen byggs om.
#
#   ./scripts/test.sh              kör alla tester
#   ./scripts/test.sh tenant       kör bara tester vars namn matchar "tenant"
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; . ./.env; set +a

DB_USER="${POSTGRES_USER:-tikkr}"
TEST_DB="${POSTGRES_DB:-tikkr}_test"
TEST_URL="postgresql://${DB_USER}:${POSTGRES_PASSWORD}@db:5432/${TEST_DB}?schema=public"

FILTER="${1:-}"

# Skapas första gången. Finns den redan säger Postgres ifrån, vilket är
# ofarligt — därför sväljs felet.
docker compose exec -T db psql -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE ${TEST_DB}" >/dev/null 2>&1 || true

MOUNTS=(
  -v "$PWD/src:/app/src"
  -v "$PWD/tests:/app/tests"
  -v "$PWD/prisma:/app/prisma"
  -v "$PWD/vitest.config.ts:/app/vitest.config.ts"
)

# Testdatabasen ges samma tabeller som schemat beskriver. Går snabbt när den
# redan stämmer, och fångar upp schemaändringar automatiskt.
docker compose run --rm -e DATABASE_URL="$TEST_URL" "${MOUNTS[@]}" migrate \
  npx prisma db push --skip-generate --accept-data-loss >/dev/null

docker compose run --rm -e DATABASE_URL="$TEST_URL" "${MOUNTS[@]}" migrate \
  npx vitest run ${FILTER:+"$FILTER"}
