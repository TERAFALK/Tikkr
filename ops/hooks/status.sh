#!/usr/bin/env bash
# shellcheck disable=SC2154  # ok, bad, warn och head_ kommer från ops/status.sh.
# Tikkrs del av driftkontrollen. Läses in av ops/status.sh.

head_ "Automatisk utstämpling"

if [ -z "${CRON_SECRET:-}" ] || [ "${CRON_SECRET}" = "byt-ut-mig-med" ]; then
  bad "CRON_SECRET saknas eller är kvar på standardvärdet i .env"
else
  ok "CRON_SECRET är satt"
fi

if crontab -l 2>/dev/null | grep -q 'auto-close.sh'; then
  ok "schemajobbet är inlagt i crontab"
else
  bad "schemajobbet är INTE schemalagt, glömda stämplingar stängs aldrig"
  echo "      */15 * * * * $PWD/scripts/auto-close.sh >> /var/log/tikkr-autoclose.log 2>&1"
fi

UNAUTH="$(curl -s -o /dev/null -w '%{http_code}' -X POST --max-time 5 \
  "http://127.0.0.1:${APP_PORT:-3000}/api/cron/auto-close" || true)"
if [ "$UNAUTH" = "401" ]; then
  ok "adressen är skyddad (nekar anrop utan hemlighet)"
else
  warn "oväntat svar utan hemlighet: $UNAUTH (förväntat 401)"
fi

OPEN_ENTRIES="$(docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  'SELECT count(*) FROM time_entries WHERE clock_out_at IS NULL' 2>/dev/null || echo "?")"
echo "      just nu öppna stämplingar: $OPEN_ENTRIES"
