#!/usr/bin/env bash
# Driftsätter en version. Samma skript i labbet och i produktionen.
#
#   ./scripts/release.sh v1.2.0       en släppt version — det enda produktionen tar
#   ./scripts/release.sh main         senaste main (bara i labbet)
#   ./scripts/release.sh fix/nagot    en gren under arbete (bara i labbet)
#
# ATT BACKA är samma kommando med den förra versionen:
#
#   ./scripts/release.sh v1.1.0
#
# Den förra imagen ligger kvar på servern och startas utan nytt bygge. Det
# backar KODEN. Databasen backas aldrig av sig själv — se docs/release.md.
#
# Ordningen, och varför:
#   1. Kontroll   rätt version, ren mapp, och i produktion en släppt tagg på main
#   2. Backup     före allt annat; det är återställningspunkten om något går fel
#   3. Bygge      medan den gamla versionen kör vidare — går bygget sönder
#                 har ingenting ändrats
#   4. Start      migrationerna körs först; faller de startas aldrig den nya appen
#   5. Kontroll   versionen ska svara i /api/health innan det räknas som klart
#
# Miljön läses ur TIKKR_ENV i .env: "production" eller "lab" (standard).
set -euo pipefail

REPO="${TIKKR_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"

# Skriptet byter version på sig självt i steg 3, när git checkout skriver om
# filerna. Bash läser ett skript bit för bit medan det körs, och en fil som
# ändras under körningen ger fel som inte går att förutse. Därför körs en
# kopia, och originalet får ändras fritt.
if [ -z "${TIKKR_RELEASE_COPY:-}" ]; then
  COPY="$(mktemp)"
  cp "$0" "$COPY"
  TIKKR_RELEASE_COPY="$COPY" TIKKR_REPO="$REPO" exec bash "$COPY" "$@"
fi
trap 'rm -f "$TIKKR_RELEASE_COPY"' EXIT

cd "$REPO"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mSTOPP:\033[0m %s\n\n' "$1" >&2; exit 1; }

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Användning: ./scripts/release.sh <version eller gren>"
  echo
  echo "Senaste versionerna:"
  git tag --list 'v*' --sort=-version:refname | head -5 | sed 's/^/  /'
  exit 1
fi

[ -f .env ] || fail "Hittar ingen .env i $REPO."
# shellcheck disable=SC1091
set -a; . ./.env; set +a

ENVIRONMENT="${TIKKR_ENV:-lab}"
PORT="${APP_PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

# "|| true" här och nedan: med pipefail stoppar annars en app som inte svarar
# hela skriptet, och just vid första driftsättningen svarar ingen.
running_version() {
  curl -s --max-time 5 "$HEALTH_URL" 2>/dev/null \
    | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true
}

# --- 1. Kontroll -------------------------------------------------------------
step "Kontrollerar $TARGET"

# Ändrade filer i mappen skulle följa med in i bygget utan att finnas i git.
# Det som körs ska gå att peka ut i historiken.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  fail "Filerna ovan är ändrade på servern. Det som driftsätts ska komma från GitHub, inte från mappen."
fi

git fetch --quiet --tags --prune --force origin

if git rev-parse -q --verify "refs/tags/$TARGET" >/dev/null; then
  COMMIT="$(git rev-parse "refs/tags/$TARGET^{commit}")"
  VERSION="$TARGET"

  # En tagg utanför main är kod som aldrig gått igenom en PR och CI.
  git merge-base --is-ancestor "$COMMIT" origin/main \
    || fail "$TARGET ligger inte på main. Slå ihop koden först och tagga sedan."
elif git rev-parse -q --verify "refs/remotes/origin/$TARGET" >/dev/null; then
  COMMIT="$(git rev-parse "refs/remotes/origin/$TARGET")"
  # Grenens namn plus commit, så att två bygg av samma gren inte delar image.
  VERSION="$(printf '%s' "$TARGET" | tr -c 'A-Za-z0-9._-' '-')-$(git rev-parse --short "$COMMIT")"
else
  fail "Hittar varken taggen eller grenen \"$TARGET\" på GitHub."
fi

if [ "$ENVIRONMENT" = "production" ]; then
  # Produktionen kör bara versioner som provats i labbet och fått en tagg.
  printf '%s' "$TARGET" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    || fail "Produktionen tar bara släppta versioner, t.ex. v1.2.0. \"$TARGET\" är ingen sådan."

  # Utan migrationsfiler bygger migrate.sh tabellerna ur schemat med
  # --accept-data-loss. Det får aldrig hända med kunddata i databasen.
  git cat-file -e "$COMMIT:prisma/migrations" 2>/dev/null \
    || fail "$TARGET saknar prisma/migrations och skulle bygga om databasen ur schemat. Den versionen kan inte köras i produktion."
fi

PREVIOUS_COMMIT="$(git rev-parse HEAD)"
RUNNING="$(running_version)"

# Det som ska stå i "backa med"-raden. Bara en släppt version går att
# driftsätta tillbaka med namn; "dev" och "main-3f2a1c9" pekar inte ut något
# skriptet kan hämta.
if printf '%s' "${RUNNING:-}" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  ROLLBACK="$RUNNING"
else
  ROLLBACK="<förra versionen>"
fi

echo "  Miljö:     $ENVIRONMENT"
echo "  Kör nu:    ${RUNNING:-okänt (svarar inte)}"
echo "  Ny:        $VERSION  (commit $(git rev-parse --short "$COMMIT"))"

if [ "$ENVIRONMENT" = "production" ]; then
  echo
  read -r -p "Skriv versionen ($VERSION) för att driftsätta i PRODUKTION: " CONFIRM
  [ "$CONFIRM" = "$VERSION" ] || fail "Avbrutet. Ingenting har ändrats."
fi

# --- 2. Backup ---------------------------------------------------------------
step "Säkerhetskopierar databasen"

./scripts/backup.sh || fail "Säkerhetskopian misslyckades. Ingenting har ändrats."
BACKUP_FILE="$(ls -t "${BACKUP_DIR:-./backups}"/tikkr_*.sql.gz 2>/dev/null | head -1 || true)"

# --- 3. Bygge ----------------------------------------------------------------
step "Bygger $VERSION"

back_to_previous() {
  git -c advice.detachedHead=false checkout --quiet --detach "$PREVIOUS_COMMIT"
}

git -c advice.detachedHead=false checkout --quiet --detach "$COMMIT"
export TIKKR_VERSION="$VERSION"

if docker image inspect "tikkr-app:$VERSION" >/dev/null 2>&1 \
  && docker image inspect "tikkr-migrate:$VERSION" >/dev/null 2>&1; then
  echo "  Imagen finns redan på servern. Inget nytt bygge."
else
  if ! docker compose build; then
    back_to_previous
    fail "Bygget misslyckades. Den gamla versionen kör orörd."
  fi
fi

# --- 4. Start ----------------------------------------------------------------
step "Kör migrationer och startar $VERSION"

# migrate körs först. Appen startar bara om den avslutas utan fel, så faller
# en migration står den gamla appen kvar och svarar.
if ! docker compose up -d; then
  echo
  docker compose logs --no-log-prefix --tail 40 migrate || true
  back_to_previous
  fail "Starten misslyckades, se loggen ovan. Föll migrationen kör den gamla versionen fortfarande, men databasen kan vara delvis ändrad. Följ docs/release.md, \"Om migrationen misslyckas\"."
fi

# --- 5. Kontroll -------------------------------------------------------------
step "Väntar på att $VERSION svarar"

HEALTHY=""
for _ in $(seq 1 45); do
  HEALTH="$(curl -s --max-time 3 "$HEALTH_URL" || true)"
  if printf '%s' "$HEALTH" | grep -q '"status":"ok"' \
    && printf '%s' "$HEALTH" | grep -q "\"version\":\"$VERSION\""; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ -z "$HEALTHY" ]; then
  echo
  docker compose logs --no-log-prefix --tail 50 app || true
  fail "$VERSION svarar inte efter 90 sekunder. Backa med: ./scripts/release.sh $ROLLBACK"
fi

# Versionen skrivs i .env först nu. En omstart av servern, eller ett
# "docker compose up -d" för hand, ska starta det som faktiskt fungerar.
if grep -q '^TIKKR_VERSION=' .env; then
  sed -i "s|^TIKKR_VERSION=.*|TIKKR_VERSION=$VERSION|" .env
else
  printf '\n# Satt av scripts/release.sh. Ändras inte för hand.\nTIKKR_VERSION=%s\n' "$VERSION" >> .env
fi

echo "  $HEALTH"
echo
docker compose ps

# Tre äldre versioner räcker att backa till. Resten tar bara disk. Listan
# kommer nyast först. "|| true": finns inget att städa svarar grep med en
# felkod, och den får inte stoppa en driftsättning som redan lyckats.
for REPO_NAME in tikkr-app tikkr-migrate; do
  OLD_TAGS="$(docker image ls "$REPO_NAME" --format '{{.Tag}}' \
    | grep -vx -e "$VERSION" -e dev -e '<none>' \
    | tail -n +4 || true)"
  for OLD in $OLD_TAGS; do
    docker image rm "$REPO_NAME:$OLD" >/dev/null 2>&1 || true
  done
done

step "Klart: $VERSION kör"
echo "  Säkerhetskopia före driftsättningen: ${BACKUP_FILE:-(ingen hittad)}"
echo "  Backa vid behov:                      ./scripts/release.sh $ROLLBACK"
echo
echo "  Kontrollera nu, enligt docs/release.md:"
echo "    - logga in i adminpanelen"
echo "    - stämpla in, byt jobb och stämpla ut på kontrollkunden"
echo "    - ta ut ett underlag som PDF"
echo "    - ./scripts/status.sh"
echo
