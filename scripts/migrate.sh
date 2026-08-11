#!/bin/sh
# Sätter upp databasen. Körs av "migrate"-containern i docker-compose, som
# startar före appen och avslutas när den är klar.
#
# Varför en egen container: Prismas kommandoverktyg drar med sig en hel del
# beroenden. Att pressa in dem i den avskalade appimagen gjorde den både
# större och skör. Här körs de i byggmiljön där allt redan finns, och appen
# får förbli liten.
set -e

if [ -d "prisma/migrations" ]; then
  # Produktionsläget: kör migrationsfilerna i tur och ordning. Det är enda
  # sättet att ändra en databas med riktig data utan att tappa något.
  echo "==> Kör databasmigrationer..."
  npx prisma migrate deploy
else
  # Utvecklingsläget: bygg tabellerna direkt ur schemat.
  #
  # Går bra så länge det inte finns data värd att behålla. Ändras schemat
  # försvinner det som ändrats — i labbet är det bara att köra seed igen.
  # Före produktion skapas en baslinjemigration med scripts/create-migration.sh,
  # och då går systemet över till grenen ovan av sig självt.
  echo "==> Bygger tabellerna ur schemat (inga migrationer)..."
  npx prisma db push --skip-generate --accept-data-loss
fi

echo "==> Databasen är klar."
