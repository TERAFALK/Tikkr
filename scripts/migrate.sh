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
  echo "==> Kör databasmigrationer..."
  npx prisma migrate deploy
else
  # Allra första starten, innan någon migration skapats. Skapar tabellerna
  # direkt ur schemat så att systemet går att starta och testa.
  # Kör scripts/create-migration.sh för att skapa den riktiga migrationen.
  echo "==> Inga migrationer hittades — skapar tabellerna ur schemat..."
  npx prisma db push --skip-generate --accept-data-loss
fi

echo "==> Databasen är klar."
