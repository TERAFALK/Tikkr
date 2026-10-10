#!/bin/sh
# Sätter upp databasen. Körs av "migrate"-containern i docker-compose, som
# startar före appen och avslutas när den är klar.
#
# Varför en egen container: Prismas kommandoverktyg drar med sig en hel del
# beroenden. Att pressa in dem i den avskalade appimagen gjorde den både
# större och skör. Här körs de i byggmiljön där allt redan finns, och appen
# får förbli liten.
#
# BARA MIGRATIONER (sedan 2026-10-10). Tidigare byggdes tabellerna direkt ur
# schemat med "prisma db push --accept-data-loss" när prisma/migrations
# saknades. Den vägen är borttagen, inte avstängd: med kunddata i databasen
# raderar den det som ändrats, och en version utan migrationer som råkade
# startas hade gjort det utan att fråga. Saknas mappen stoppar skriptet, och
# appen startar inte — den gamla versionen står kvar.
set -e

if [ ! -d "prisma/migrations" ]; then
  echo "STOPP: prisma/migrations saknas i den här versionen."
  echo "Databasen ändras bara med migrationer. Se docs/drift.md punkt 1."
  exit 1
fi

echo "==> Kör databasmigrationer..."
npx prisma migrate deploy

echo "==> Databasen är klar."
