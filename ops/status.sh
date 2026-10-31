#!/usr/bin/env bash
# Driftkontroll: går igenom allt som ska vara på plats och säger vad som inte är.
# Den ändrar ingenting.
#
#   ./ops/status.sh
#
# Appens egna kontroller ligger i kroken STATUS_HOOK, som kan använda ok, warn,
# bad och head_.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

# shellcheck source=lib.sh
. ./ops/lib.sh
ops_load "$PWD"

OK=0
WARN=0
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; OK=$((OK+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# --- Containrar -------------------------------------------------------------
head_ "Containrar"

if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^app$'; then
  ok "appen kör"
else
  bad "appen kör INTE, kör: docker compose up -d"
fi

if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^db$'; then
  ok "databasen kör"
else
  bad "databasen kör INTE"
fi

HEALTH="$(curl -s --max-time 5 "$HEALTH_URL" || true)"
if echo "$HEALTH" | grep -q '"database":"ok"'; then
  ok "hälsokontrollen svarar och når databasen"
else
  bad "hälsokontrollen svarar inte som väntat: ${HEALTH:-inget svar}"
fi

# --- Version ----------------------------------------------------------------
head_ "Version"

RUNNING="$(echo "$HEALTH" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
echo "      miljö: $ENVIRONMENT · kör: ${RUNNING:-okänd}"

if [ "$ENVIRONMENT" = "production" ]; then
  if echo "${RUNNING:-}" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    ok "produktionen kör en släppt version"
  else
    bad "produktionen kör \"${RUNNING:-okänd}\", inte en släppt version"
  fi

  if echo "${COMPOSE_FILE:-}" | grep -q 'docker-compose.prod.yml'; then
    ok "COMPOSE_FILE tar med produktionsfilen"
  else
    bad "COMPOSE_FILE saknas i .env, docker compose startar då utan proxyn"
    echo "      echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml' >> .env"
  fi
fi

# --- Hur databasen byggs ----------------------------------------------------
head_ "Databasens uppbyggnad"

if [ ! -d prisma/migrations ]; then
  bad "prisma/migrations saknas, migrate.sh vägrar starta och appen med den"
else
  COUNT="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l)"
  ok "$COUNT migration(er) styr databasen"

  if [ -n "$(git status --porcelain prisma/migrations 2>/dev/null)" ]; then
    bad "migrationer är INTE incheckade i git"
  else
    ok "migrationerna finns i git"
  fi
fi

# --- Säkerhetskopior --------------------------------------------------------
head_ "Säkerhetskopior"

if [ -z "${BACKUP_REMOTE:-}" ]; then
  bad "BACKUP_REMOTE saknas i .env, kopior hamnar bara på den här servern"
else
  ok "offsite-mål: $BACKUP_REMOTE"
  if command -v rclone >/dev/null 2>&1; then
    ok "rclone är installerat"
  else
    bad "rclone saknas, offsite-kopieringen kan inte köras"
  fi
fi

if crontab -l 2>/dev/null | grep -q 'backup.sh'; then
  ok "backupjobbet är inlagt i crontab"
else
  bad "backupjobbet är INTE schemalagt"
  echo "      0 3,12 * * * $PWD/ops/backup.sh >> /var/log/$APP_SLUG-backup.log 2>&1"
fi

LATEST="$(find backups -name "${BACKUP_PREFIX}_*.sql.gz" -type f 2>/dev/null | sort | tail -1)"
if [ -n "$LATEST" ]; then
  AGE_H=$(( ($(date +%s) - $(stat -c %Y "$LATEST")) / 3600 ))
  if [ "$AGE_H" -lt 48 ]; then
    ok "senaste kopian är $AGE_H timmar gammal"
  else
    warn "senaste kopian är $AGE_H timmar gammal, jobbet kanske inte kör"
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

if [ -z "${APP_URL:-}" ]; then
  bad "APP_URL saknas i .env, inga mejlade länkar går att bygga"
elif ! echo "$APP_URL" | grep -q '^https://'; then
  warn "APP_URL börjar inte med https:// ($APP_URL)"
else
  ok "APP_URL är satt"
fi

# --- Appens egna kontroller -------------------------------------------------
if [ -n "${STATUS_HOOK:-}" ] && [ -f "$STATUS_HOOK" ]; then
  # shellcheck disable=SC1090
  . "$STATUS_HOOK"
fi

# --- Sammanfattning ---------------------------------------------------------
printf '\n\033[1mSammanfattning:\033[0m %d klara, %d varningar, %d att åtgärda\n\n' \
  "$OK" "$WARN" "$FAIL"

[ "$FAIL" -eq 0 ]
