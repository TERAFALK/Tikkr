#!/bin/sh
# Körs varje gång appcontainern startar, innan själva appen.
#
# Uppgift: se till att databasen har rätt tabeller, och starta sedan appen.
# Det gör att en deploy med en ny tabell fungerar av sig själv — inget
# manuellt steg som kan glömmas bort.
set -e

# Prisma anropas via sin JS-fil direkt. Den avskalade produktionsimagen saknar
# genvägarna i node_modules/.bin som "npx prisma" letar efter.
PRISMA="node_modules/prisma/build/index.js"

if [ ! -f "$PRISMA" ]; then
  echo "FEL: hittar inte Prisma CLI på $PRISMA"
  echo "Imagen är felbyggd — kontrollera COPY-raderna i Dockerfile."
  exit 1
fi

if [ -d "prisma/migrations" ]; then
  # Normalfallet: kör migrationsfilerna i tur och ordning.
  echo "==> Kör databasmigrationer..."
  node "$PRISMA" migrate deploy
else
  # Allra första starten, innan någon migration skapats. Skapar tabellerna
  # direkt ur schemat så att systemet går att starta och testa.
  # Kör scripts/create-migration.sh för att skapa den riktiga migrationen.
  echo "==> Inga migrationer hittades — skapar tabellerna ur schemat..."
  node "$PRISMA" db push --skip-generate --accept-data-loss
fi

echo "==> Startar Tikkr..."
# exec gör att appen tar över processen, så att Docker kan stoppa den snyggt.
exec node server.js
