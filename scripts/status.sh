#!/usr/bin/env bash
# Driftkontroll: går igenom allt som ska vara på plats och säger vad som inte är.
#
# Kör den när du undrar om systemet står stadigt, och efter varje ändring på
# servern. Den ändrar ingenting — bara tittar.
#
#   ./scripts/status.sh
set -uo pipefail

cd "$(dirname "$0")/.."

OK=0
WARN=0
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; OK=$((OK+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

# --- Containrar -------------------------------------------------------------
head_ "Containrar"

if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^app$'; then
  ok "appen kör"
else
  bad "appen kör INTE — kör: docker compose up -d"
fi

if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^db$'; then
  ok "databasen kör"
else
  bad "databasen kör INTE"
fi

PORT="${APP_PORT:-3000}"
HEALTH="$(curl -s --max-time 5 "http://127.0.0.1:${PORT}/api/health" || true)"
if echo "$HEALTH" | grep -q '"database":"ok"'; then
  ok "hälsokollen svarar och når databasen"
else
  bad "hälsokollen svarar inte som väntat: ${HEALTH:-inget svar}"
fi

# --- Hur databasen byggs ----------------------------------------------------
head_ "Databasens uppbyggnad"

if [ ! -d prisma/migrations ]; then
  ok "byggs direkt ur prisma/schema.prisma (utvecklingsläge)"
  echo "      Rätt läge tills det finns data värd att behålla. Ändras schemat"
  echo "      försvinner det som ändrats — kör seed igen efteråt."
  echo "      Före produktion: ./scripts/create-migration.sh init"
else
  COUNT="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l)"
  ok "$COUNT migration(er) styr databasen (produktionsläge)"

  if git check-ignore -q prisma/migrations 2>/dev/null; then
    bad "migrationerna ignoreras av git och finns alltså bara här"
    echo "      Ta bort raden prisma/migrations/ ur .gitignore och checka in dem,"
    echo "      annars går databasen inte att återskapa på en annan server."
  elif [ -n "$(git status --porcelain prisma/migrations 2>/dev/null)" ]; then
    bad "migrationer är INTE incheckade i git"
  else
    ok "migrationerna finns i git"
  fi
fi

# --- Automatisk utstämpling -------------------------------------------------
head_ "Automatisk utstämpling"

if [ -z "${CRON_SECRET:-}" ] || [ "${CRON_SECRET}" = "byt-ut-mig-med" ]; then
  bad "CRON_SECRET saknas eller är kvar på standardvärdet i .env"
else
  ok "CRON_SECRET är satt"
fi

if crontab -l 2>/dev/null | grep -q 'auto-close.sh'; then
  ok "schemajobbet är inlagt i crontab"
else
  bad "schemajobbet är INTE schemalagt — glömda stämplingar stängs aldrig"
  echo "      crontab -e  och lägg till:"
  echo "      */15 * * * * $PWD/scripts/auto-close.sh >> /var/log/tikkr-autoclose.log 2>&1"
fi

UNAUTH="$(curl -s -o /dev/null -w '%{http_code}' -X POST --max-time 5 \
  "http://127.0.0.1:${PORT}/api/cron/auto-close" || true)"
if [ "$UNAUTH" = "401" ]; then
  ok "adressen är skyddad (nekar anrop utan hemlighet)"
else
  warn "oväntat svar utan hemlighet: $UNAUTH (förväntat 401)"
fi

OPEN_ENTRIES="$(docker compose exec -T db psql -U "${POSTGRES_USER:-tikkr}" \
  -d "${POSTGRES_DB:-tikkr}" -tAc \
  'SELECT count(*) FROM time_entries WHERE clock_out_at IS NULL' 2>/dev/null || echo "?")"
echo "      just nu öppna stämplingar: $OPEN_ENTRIES"

# --- Säkerhetskopior --------------------------------------------------------
head_ "Säkerhetskopior"

if [ -z "${BACKUP_REMOTE:-}" ]; then
  bad "BACKUP_REMOTE saknas i .env — kopior hamnar bara på den här servern"
  echo "      En backup på samma maskin skyddar mot råkade raderingar,"
  echo "      men inte mot att servern dör, hackas eller krypteras."
else
  ok "offsite-mål: $BACKUP_REMOTE"
  if command -v rclone >/dev/null 2>&1; then
    ok "rclone är installerat"
  else
    bad "rclone saknas — offsite-kopieringen kan inte köras"
  fi
fi

if crontab -l 2>/dev/null | grep -q 'backup.sh'; then
  ok "backupjobbet är inlagt i crontab"
else
  bad "backupjobbet är INTE schemalagt"
  echo "      0 3 * * * $PWD/scripts/backup.sh >> /var/log/tikkr-backup.log 2>&1"
fi

LATEST="$(find backups -name 'tikkr_*.sql.gz' -type f 2>/dev/null | sort | tail -1)"
if [ -n "$LATEST" ]; then
  AGE_H=$(( ($(date +%s) - $(stat -c %Y "$LATEST")) / 3600 ))
  if [ "$AGE_H" -lt 48 ]; then
    ok "senaste kopian är $AGE_H timmar gammal"
  else
    warn "senaste kopian är $AGE_H timmar gammal — jobbet kanske inte kör"
  fi
else
  warn "ingen säkerhetskopia hittad ännu"
fi

# --- Hemligheter ------------------------------------------------------------
head_ "Hemligheter"

for VAR in AUTH_SECRET POSTGRES_PASSWORD; do
  VALUE="${!VAR:-}"
  if [ -z "$VALUE" ]; then
    bad "$VAR saknas i .env"
  elif [ "${#VALUE}" -lt 24 ] || echo "$VALUE" | grep -qi 'byt-ut'; then
    bad "$VAR är för kort eller kvar på standardvärdet"
  else
    ok "$VAR är satt"
  fi
done

# --- Sammanfattning ---------------------------------------------------------
printf '\n\033[1mSammanfattning:\033[0m %d klara, %d varningar, %d att åtgärda\n\n' \
  "$OK" "$WARN" "$FAIL"

[ "$FAIL" -eq 0 ]
