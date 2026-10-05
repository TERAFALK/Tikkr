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
#
# Loggfilen måste finnas och vara skrivbar FÖR DIG först. /var/log ägs av root,
# så cron-raden misslyckas annars med "Permission denied" — och då finns ingen
# logg att felsöka i, vilket är exakt när man behöver den:
#   sudo install -o "$USER" -g "$USER" -m 644 /dev/null /var/log/tikkr-autoclose.log
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; . ./.env; set +a

if [ -z "${CRON_SECRET:-}" ]; then
  echo "[$(date -Is)] CRON_SECRET saknas i .env — hoppar över."
  exit 1
fi

PORT="${APP_PORT:-3000}"

# Övervakningens adress, t.ex. en kontroll hos Healthchecks.io. Valfri.
#
# Ett schemajobb som slutar köra märks inte — det är frånvaron av något som
# ska upptäckas. Tjänsten larmar när pingen uteblir, och när den kommer till
# /fail. Pingen bär ingenting om kunderna, bara att jobbet gick.
ping() {
  [ -n "${CRON_PING_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${CRON_PING_URL}${1:-}" || true
}

# Anropar appen lokalt på servern, inte via internet. Trafiken lämnar alltså
# aldrig maskinen.
#
# --fail-with-body: ett felsvar från appen (500, 503) ska bli ett misslyckat
# jobb. Utan flaggan räknade curl allt som kom tillbaka som lyckat, och ett
# trasigt jobb skrev bara en rad i en logg ingen läser.
if RESPONSE="$(curl -sS --fail-with-body -m 120 -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:${PORT}/api/cron/auto-close")"; then
  echo "[$(date -Is)] $RESPONSE"
  ping
else
  echo "[$(date -Is)] MISSLYCKADES: $RESPONSE"
  ping /fail
  exit 1
fi
