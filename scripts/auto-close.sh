#!/usr/bin/env bash
# Stänger glömda stämplingar. Ska köras schemalagt, var 15:e minut.
#
# Utan detta jobb händer ingen automatisk utstämpling alls — en anställd som
# glömmer stämpla ut skulle få en post som räknas upp i evighet, och rapporterna
# skulle visa orimliga timmar.
#
# Lägg in i crontab:
#   crontab -e
#   */15 * * * * /sokvag/till/tikkr/scripts/auto-close.sh >> /var/log/tikkr-autoclose.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; . ./.env; set +a

if [ -z "${CRON_SECRET:-}" ]; then
  echo "[$(date -Is)] CRON_SECRET saknas i .env — hoppar över."
  exit 1
fi

PORT="${APP_PORT:-3000}"

# Anropar appen lokalt på servern, inte via internet. Trafiken lämnar alltså
# aldrig maskinen.
RESPONSE="$(curl -sS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:${PORT}/api/cron/auto-close")"

echo "[$(date -Is)] $RESPONSE"
