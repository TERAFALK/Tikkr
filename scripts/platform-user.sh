#!/usr/bin/env bash
# Skapar eller uppdaterar ett konto till plattformspanelen.
#
# Lösenord för plattformskonton sätts BARA här, aldrig via webben. En
# registreringssida skulle låta den som gissar en tillåten adress hinna först
# och sätta lösenordet innan den rätta personen gjort det. Den som kan köra
# det här kommandot har redan tillgång till servern.
#
#   ./scripts/platform-user.sh adi@terafalk.com
#   ./scripts/platform-user.sh gammal@adress.se --ta-bort
set -euo pipefail

cd "$(dirname "$0")/.."

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "Användning: ./scripts/platform-user.sh <e-postadress> [--ta-bort]"
  exit 1
fi

if [ "${2:-}" = "--ta-bort" ]; then
  docker compose run --rm --no-TTY migrate \
    node scripts/platform-user.mjs "$EMAIL" --ta-bort < /dev/null
  exit 0
fi

echo "Sätter lösenord för $EMAIL"
echo "Minst 12 tecken. Kontot ser alla kunders driftdata."
echo

# -s döljer det du skriver. Lösenordet skickas via standard input och aldrig
# som argument eller miljövariabel — argument syns i processlistan och
# miljövariabler i "docker inspect".
read -rs -p "Lösenord: " PASSWORD
echo
read -rs -p "Upprepa:  " REPEAT
echo

if [ "$PASSWORD" != "$REPEAT" ]; then
  echo "Lösenorden är inte lika. Ingenting ändrades."
  exit 1
fi

printf '%s' "$PASSWORD" | docker compose run --rm --no-TTY migrate \
  node scripts/platform-user.mjs "$EMAIL"
