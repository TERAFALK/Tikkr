#!/usr/bin/env bash
# Skapar en migrationsfil av ändringarna i prisma/schema.prisma.
#
# En migration är en fil som beskriver exakt hur databasen ska ändras — t.ex.
# "lägg till kolumnen foto på employees". Filerna checkas in i git och körs
# automatiskt i tur och ordning när appen startar. Det är så databasen på
# servern hålls i takt med koden utan att någon behöver komma ihåg något.
#
# Kör från projektmappen på servern:  ./scripts/create-migration.sh init
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Användning: ./scripts/create-migration.sh <namn>"
  echo "Exempel:    ./scripts/create-migration.sh lagg-till-foto-pa-anstalld"
  exit 1
fi

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Hittar ingen .env. Kör 'cp .env.example .env' och fyll i lösenordet först."
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

NETWORK="$(docker compose ps --format '{{.Name}}' db | head -1)"
if [ -z "$NETWORK" ]; then
  echo "Databasen verkar inte köra. Kör 'docker compose up -d db' först."
  exit 1
fi

echo "Skapar migration '$NAME'..."

# En engångscontainer med projektmappen inmonterad, så att migrationsfilen
# hamnar i din riktiga projektmapp och kan checkas in i git.
docker run --rm -it \
  -v "$PWD:/work" -w /work \
  --network "container:$NETWORK" \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-tikkr}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB:-tikkr}?schema=public" \
  node:22-alpine \
  sh -c "apk add --no-cache openssl >/dev/null && npm install --silent && npx prisma migrate dev --name '$NAME'"

echo
echo "Klart. Checka in migrationen:"
echo "  git add prisma/migrations && git commit -m 'Migration: $NAME' && git push"
