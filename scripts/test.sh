#!/usr/bin/env bash
# Kör de automatiska testerna mot den kod som ligger i mappen just nu.
#
# Varför inte bara "docker compose run migrate npm test": när imagen byggs
# kopieras koden in i den som en ögonblicksbild. Ändrar du en fil efteråt kör
# containern fortfarande den gamla kopian tills du bygger om. Här monteras
# mapparna in direkt istället, så testerna alltid ser din senaste kod — utan
# ombyggnad, på ett par sekunder.
#
#   ./scripts/test.sh              kör alla tester
#   ./scripts/test.sh tenant       kör bara tester vars namn matchar "tenant"
set -euo pipefail

cd "$(dirname "$0")/.."

FILTER="${1:-}"

docker compose run --rm \
  -v "$PWD/src:/app/src" \
  -v "$PWD/tests:/app/tests" \
  -v "$PWD/prisma:/app/prisma" \
  -v "$PWD/vitest.config.ts:/app/vitest.config.ts" \
  migrate \
  npx vitest run ${FILTER:+"$FILTER"}
