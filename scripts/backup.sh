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
#
# Loggfilen måste finnas och vara skrivbar FÖR DIG först. /var/log ägs av root,
# så cron-raden misslyckas annars med "Permission denied" — och då finns ingen
# logg att felsöka i, vilket är exakt när man behöver den:
#   sudo install -o "$USER" -g "$USER" -m 644 /dev/null /var/log/tikkr-backup.log
#
# KRYPTERING: BACKUP_REMOTE ska peka på ett rclone-mål av typen "crypt", som
# lägger sig ovanpå själva lagringen. Då lämnar ingen okrypterad kopia servern,
# och leverantören av lagringen ser bara brus. Se docs/drift.md punkt 3.
#
# ÖVERVAKNING: BACKUP_PING_URL (t.ex. en kontroll hos Healthchecks.io) pingas
# när allt gått bra och får /fail när något gått fel. En backup som slutat
# köra syns annars först den dag den behövs.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; . ./.env; set +a

ping() {
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${BACKUP_PING_URL}${1:-}" || true
}

# Varje fel efter den här raden, var det än inträffar, rapporteras innan
# skriptet avslutas. set -e räcker inte ensamt: det avslutar tyst.
trap 'echo "[$(date -Is)] MISSLYCKADES på rad $LINENO"; ping /fail' ERR

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
REMOTE_KEEP_DAYS="${BACKUP_REMOTE_KEEP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$BACKUP_DIR/tikkr_$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] Dumpar databasen..."
docker compose exec -T db pg_dump \
  -U "${POSTGRES_USER:-tikkr}" \
  -d "${POSTGRES_DB:-tikkr}" \
  --clean --if-exists \
  | gzip > "$FILE"

# Filen kontrolleras innan den räknas som en kopia. En avbruten dump ger en
# fil som finns men inte går att läsa tillbaka, och den upptäcks annars först
# vid återläsningen.
gzip -t "$FILE"
if ! gunzip -c "$FILE" | tail -n 20 | grep -q "PostgreSQL database dump complete"; then
  echo "[$(date -Is)] Dumpen är ofullständig: $FILE"
  false
fi

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[$(date -Is)] Lokal kopia klar: $FILE ($SIZE)"

# --- Kopiera till en annan plats -------------------------------------------
# Kräver rclone konfigurerat mot en objektlagring inom EU, med ett crypt-mål
# ovanpå. Sätt BACKUP_REMOTE i .env, exempel:
#   BACKUP_REMOTE=tikkr-krypterad:
if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "[$(date -Is)] Kopierar till $BACKUP_REMOTE..."
  rclone copy "$FILE" "$BACKUP_REMOTE" --stats-one-line

  # Gamla kopior tas bort även där. Integritetspolicyn anger hur länge en
  # säkerhetskopia finns kvar, och en anonymiserad person ska inte finnas kvar
  # i ett arkiv för alltid.
  rclone delete "$BACKUP_REMOTE" --min-age "${REMOTE_KEEP_DAYS}d" --include 'tikkr_*.sql.gz'
  echo "[$(date -Is)] Offsite-kopia klar. Behåller $REMOTE_KEEP_DAYS dagar där."
else
  echo "[$(date -Is)] VARNING: BACKUP_REMOTE är inte satt i .env."
  echo "                Kopian ligger bara på den här servern, vilket inte"
  echo "                skyddar mot att servern går förlorad."
fi

# --- Städa gamla kopior -----------------------------------------------------
find "$BACKUP_DIR" -name 'tikkr_*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "[$(date -Is)] Klart. Behåller $KEEP_DAYS dagar lokalt."

# Utan offsite-kopia är jobbet inte lyckat, även om allt ovan gick bra. Pingen
# uteblir, och övervakningen larmar tills målet är satt.
if [ -n "${BACKUP_REMOTE:-}" ]; then
  ping
else
  ping /fail
fi
