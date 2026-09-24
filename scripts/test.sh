#!/usr/bin/env bash
# Kör de automatiska testerna mot den kod som ligger i mappen just nu.
#
# Testerna kör mot en EGEN databas, skild från appens. Skälet: de skapar och
# raderar företag hela tiden, och en avbruten körning lämnar rader kvar. Låg de
# i samma databas skulle "Rapporttest AB" dyka upp bland riktiga kunder i
# plattformspanelen — och en testkörning skulle kunna radera något på riktigt.
#
# Koden monteras in istället för att bakas in, så testerna alltid ser din
# senaste ändring utan att imagen byggs om. Det gäller även prisma/schema.prisma
# — både databasen och Prisma-klienten byggs om ur det vid varje körning.
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

# Tre steg i EN container, och det är avsiktligt:
#
#  1. Testdatabasen ges samma tabeller som schemat beskriver.
#  2. Prisma-klienten genereras om ur schemat.
#  3. Testerna körs.
#
# Steg 2 finns för att prisma/ monteras in från värden och därmed kan vara
# nyare än den klient som bakades in i imagen. Utan det kör testerna mot en
# gammal klient och faller på fält som finns i databasen men inte i koden —
# ett fel som pekar åt helt fel håll och tar en stund att genomskåda.
#
# Att det sker i SAMMA container är inte en förenkling utan ett krav:
# node_modules ligger i containerns eget filsystem och följer inte med till
# nästa "docker compose run", så en generate i en egen körning kastas bort.
docker compose run --rm -e DATABASE_URL="$TEST_URL" "${MOUNTS[@]}" migrate \
  sh -c 'npx prisma db push --skip-generate --accept-data-loss >/dev/null \
    && npx prisma generate >/dev/null \
    && npx vitest run "$@"' \
  sh ${FILTER:+"$FILTER"}
