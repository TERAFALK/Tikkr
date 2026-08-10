#!/usr/bin/env bash
# Daglig säkerhetskopia av databasen.
#
# Det här är kundernas tidsdata — förloras den finns inget sätt att
# rekonstruera den. Därför två regler:
#   1. Kopian ska ligga på en ANNAN plats än servern. En backup på samma
#      maskin skyddar mot råkade raderingar, men inte mot att servern dör,
#      blir hackad eller krypteras.
#   2. Återläsning ska testas då och då. En backup ingen provat att läsa
#      tillbaka är bara en förhoppning.
#
# Sätts upp som schemalagt jobb, t.ex. varje natt kl 03:
#   crontab -e
#   0 3 * * * /sokvag/till/tikkr/scripts/backup.sh >> /var/log/tikkr-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; . ./.env; set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$BACKUP_DIR/tikkr_$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] Dumpar databasen..."
docker compose exec -T db pg_dump \
  -U "${POSTGRES_USER:-tikkr}" \
  -d "${POSTGRES_DB:-tikkr}" \
  --clean --if-exists \
  | gzip > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[$(date -Is)] Lokal kopia klar: $FILE ($SIZE)"

# --- Kopiera till en annan plats -------------------------------------------
# Kräver rclone konfigurerat mot en objektlagring (t.ex. Hetzner Storage Box,
# Backblaze B2 eller S3). Sätt BACKUP_REMOTE i .env, exempel:
#   BACKUP_REMOTE=b2:tikkr-backups
if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "[$(date -Is)] Kopierar till $BACKUP_REMOTE..."
  rclone copy "$FILE" "$BACKUP_REMOTE" --stats-one-line
  echo "[$(date -Is)] Offsite-kopia klar."
else
  echo "[$(date -Is)] VARNING: BACKUP_REMOTE är inte satt i .env."
  echo "                Kopian ligger bara på den här servern, vilket inte"
  echo "                skyddar mot att servern går förlorad."
fi

# --- Städa gamla kopior -----------------------------------------------------
find "$BACKUP_DIR" -name 'tikkr_*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "[$(date -Is)] Klart. Behåller $KEEP_DAYS dagar lokalt."
