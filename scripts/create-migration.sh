#!/usr/bin/env bash
# Skapar en migrationsfil av ändringarna i prisma/schema.prisma.
#
# En migration är en fil som beskriver exakt hur databasen ska ändras — t.ex.
# "lägg till kolumnen foto på employees". Filerna checkas in i git och körs
# automatiskt i tur och ordning när systemet startar. Det är så databasen på
# servern hålls i takt med koden utan att någon behöver komma ihåg något.
#
# Kör från projektmappen på servern:
#   ./scripts/create-migration.sh init
#   ./scripts/create-migration.sh lagg-till-foto-pa-anstalld
set -euo pipefail

cd "$(dirname "$0")/.."

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Användning: ./scripts/create-migration.sh <namn>"
  echo "Exempel:    ./scripts/create-migration.sh lagg-till-foto-pa-anstalld"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Hittar ingen .env. Kör 'cp .env.example .env' först."
  exit 1
fi

# Projektmappen monteras in i containern så att den nya filen hamnar i din
# riktiga mapp och kan checkas in i git.
#
# --user gör att filen ägs av dig och inte av root. Utan den skapar containern
# root-ägda filer i din mapp, som du sedan inte kan radera utan sudo.
MOUNT=(-v "$PWD/prisma:/app/prisma" --user "$(id -u):$(id -g)")

if [ ! -d prisma/migrations ]; then
  # Första gången. Databasen har redan tabeller (skapade direkt ur schemat vid
  # första starten), så vi kan inte låta Prisma köra migrationen — den finns
  # ju i praktiken redan. Istället skrivs den ut som fil och markeras som
  # "redan körd". Det kallas att baslinjera, och ger en ren historik framåt.
  echo "==> Skapar första migrationen (baslinje)..."
  mkdir -p "prisma/migrations/0_$NAME"

  docker compose run --rm --no-deps "${MOUNT[@]}" migrate \
    npx prisma migrate diff \
      --from-empty \
      --to-schema-datamodel prisma/schema.prisma \
      --script > "prisma/migrations/0_$NAME/migration.sql"

  echo "==> Markerar den som redan körd..."
  docker compose run --rm "${MOUNT[@]}" migrate \
    npx prisma migrate resolve --applied "0_$NAME"
else
  # --skip-generate: Prisma-koden genereras ändå vid nästa bygge, och att
  # skriva den här skulle kräva åtkomst till mappar containern äger.
  echo "==> Skapar migration '$NAME'..."
  docker compose run --rm "${MOUNT[@]}" migrate \
    npx prisma migrate dev --name "$NAME" --skip-generate
fi

echo
echo "Klart. Checka in den:"
echo "  git add prisma/migrations && git commit -m 'Migration: $NAME' && git push"
