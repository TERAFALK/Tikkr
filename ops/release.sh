#!/usr/bin/env bash
# Driftsätter en version. Samma skript i labbet och i produktionen.
#
#   ./ops/release.sh v1.2.0       en släppt version, det enda produktionen tar
#   ./ops/release.sh dev          senaste dev (bara i labbet)
#   ./ops/release.sh fix/nagot    en gren under arbete (bara i labbet)
#
# ATT BACKA är samma kommando med den förra versionen:
#
#   ./ops/release.sh v1.1.0
#
# Den förra imagen ligger kvar på servern och startas utan nytt bygge. Det backar
# KODEN. Databasen backas aldrig av sig själv, se docs/ops/rollback.md i
# tf-framework.
#
# Ordningen, och varför:
#   1. Kontroll   rätt version, ren mapp, och i produktion en släppt tagg på prod
#   2. Backup     före allt annat; det är återställningspunkten om något går fel
#   3. Image      hämtas eller byggs medan den gamla versionen kör vidare
#   4. Start      migrationerna körs först; faller de startas aldrig den nya appen
#   5. Kontroll   versionen ska svara i hälsokontrollen innan det räknas som klart
#
# Miljön läses ur <ENV_PREFIX>_ENV i .env: "production" eller "lab" (förval).
set -euo pipefail

REPO="${OPS_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"

# Skriptet byter version på sig självt i steg 3, när git checkout skriver om
# filerna. Bash läser ett skript bit för bit medan det körs, och en fil som
# ändras under körningen ger fel som inte går att förutse. Därför körs en kopia,
# och originalet får ändras fritt.
if [ -z "${OPS_RELEASE_COPY:-}" ]; then
  COPY="$(mktemp)"
  cp "$0" "$COPY"
  OPS_RELEASE_COPY="$COPY" OPS_REPO="$REPO" exec bash "$COPY" "$@"
fi
trap 'rm -f "$OPS_RELEASE_COPY"' EXIT

cd "$REPO"

# shellcheck source=lib.sh
. ./ops/lib.sh

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Användning: ./ops/release.sh <version eller gren>"
  echo
  echo "Senaste versionerna:"
  git tag --list 'v*' --sort=-version:refname | head -5 | sed 's/^/  /'
  exit 1
fi

[ -f .env ] || fail "Hittar ingen .env i $REPO."
ops_load "$REPO"

# "|| true" här och nedan: med pipefail stoppar annars en app som inte svarar
# hela skriptet, och just vid första driftsättningen svarar ingen.
running_version() {
  curl -s --max-time 5 "$HEALTH_URL" 2>/dev/null \
    | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true
}

# --- 1. Kontroll -------------------------------------------------------------
step "Kontrollerar $TARGET"

# Ändrade filer i mappen skulle följa med in i bygget utan att finnas i git. Det
# som körs ska gå att peka ut i historiken.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  fail "Filerna ovan är ändrade på servern. Det som driftsätts ska komma från GitHub, inte från mappen."
fi

git fetch --quiet --tags --prune --force origin

if git rev-parse -q --verify "refs/tags/$TARGET" >/dev/null; then
  COMMIT="$(git rev-parse "refs/tags/$TARGET^{commit}")"
  VERSION="$TARGET"

  # En tagg utanför prod är kod som aldrig gått igenom en PR och CI.
  git merge-base --is-ancestor "$COMMIT" origin/prod \
    || fail "$TARGET ligger inte på prod. Slå ihop dev i prod först och tagga sedan."
elif git rev-parse -q --verify "refs/remotes/origin/$TARGET" >/dev/null; then
  COMMIT="$(git rev-parse "refs/remotes/origin/$TARGET")"
  # Grenens namn plus commit, så att två bygg av samma gren inte delar image.
  # Samma format som app-image.yml räknar fram.
  VERSION="$(printf '%s' "$TARGET" | tr -c 'A-Za-z0-9._-' '-')-$(git rev-parse --short=7 "$COMMIT")"
else
  fail "Hittar varken taggen eller grenen \"$TARGET\" på GitHub."
fi

if [ "$ENVIRONMENT" = "production" ]; then
  # Produktionen kör bara versioner som provats i labbet och fått en tagg.
  printf '%s' "$TARGET" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    || fail "Produktionen tar bara släppta versioner, t.ex. v1.2.0. \"$TARGET\" är ingen sådan."

  git cat-file -e "$COMMIT:prisma/migrations" 2>/dev/null \
    || fail "$TARGET saknar prisma/migrations. Databasen ändras bara med migrationer."
fi

PREVIOUS_COMMIT="$(git rev-parse HEAD)"
RUNNING="$(running_version)"

# Det som ska stå i "backa med"-raden. Bara en släppt version går att driftsätta
# tillbaka med namn.
if printf '%s' "${RUNNING:-}" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  ROLLBACK="$RUNNING"
else
  ROLLBACK="<förra versionen>"
fi

echo "  Miljö:     $ENVIRONMENT"
echo "  Kör nu:    ${RUNNING:-okänt (svarar inte)}"
echo "  Ny:        $VERSION  (commit $(git rev-parse --short=7 "$COMMIT"))"

if [ -n "${PRE_RELEASE_HOOK:-}" ]; then
  # Från den version som ska ut, inte den som ligger i mappen. En äldre version
  # saknar kroken, och det får aldrig hindra att man backar till den.
  if git show "$COMMIT:$PRE_RELEASE_HOOK" > "$OPS_RELEASE_COPY.hook" 2>/dev/null; then
    bash "$OPS_RELEASE_COPY.hook" "$COMMIT" "$VERSION" "$ENVIRONMENT" \
      || { rm -f "$OPS_RELEASE_COPY.hook"; fail "Kroken $PRE_RELEASE_HOOK stoppade driftsättningen. Ingenting har ändrats."; }
  else
    echo "  Krok:      $PRE_RELEASE_HOOK saknas i $VERSION, hoppar över den."
  fi
  rm -f "$OPS_RELEASE_COPY.hook"
fi

if [ "$ENVIRONMENT" = "production" ]; then
  echo
  read -r -p "Skriv versionen ($VERSION) för att driftsätta i PRODUKTION: " CONFIRM
  [ "$CONFIRM" = "$VERSION" ] || fail "Avbrutet. Ingenting har ändrats."
fi

# --- 2. Backup ---------------------------------------------------------------
step "Säkerhetskopierar databasen"

./ops/backup.sh || fail "Säkerhetskopian misslyckades. Ingenting har ändrats."
BACKUP_FILE="$(ls -t "${BACKUP_DIR:-./backups}/${BACKUP_PREFIX}"_*.sql.gz 2>/dev/null | head -1 || true)"

# --- 3. Image ----------------------------------------------------------------
step "Förbereder $VERSION"

back_to_previous() {
  git -c advice.detachedHead=false checkout --quiet --detach "$PREVIOUS_COMMIT"
}

git -c advice.detachedHead=false checkout --quiet --detach "$COMMIT"
export "$VERSION_VAR=$VERSION"

if [ -n "${IMAGE_REPO:-}" ]; then
  APP_IMAGE="$IMAGE_REPO-app"
  MIGRATE_IMAGE="$IMAGE_REPO-migrate"
else
  APP_IMAGE="$APP_SLUG-app"
  MIGRATE_IMAGE="$APP_SLUG-migrate"
fi

if docker image inspect "$APP_IMAGE:$VERSION" >/dev/null 2>&1 \
  && docker image inspect "$MIGRATE_IMAGE:$VERSION" >/dev/null 2>&1; then
  echo "  Imagen finns redan på servern."
elif [ -n "${IMAGE_REPO:-}" ]; then
  if ! docker compose pull app migrate; then
    back_to_previous
    fail "Kunde inte hämta $APP_IMAGE:$VERSION. Är CI klar för den här versionen? Den gamla versionen kör orörd."
  fi
else
  if ! docker compose build; then
    back_to_previous
    fail "Bygget misslyckades. Den gamla versionen kör orörd."
  fi
fi

# --- 4. Start ----------------------------------------------------------------
step "Kör migrationer och startar $VERSION"

# migrate körs först. Appen startar bara om den avslutas utan fel, så faller en
# migration står den gamla appen kvar och svarar.
if ! docker compose up -d; then
  echo
  docker compose logs --no-log-prefix --tail 40 migrate || true
  back_to_previous
  fail "Starten misslyckades, se loggen ovan. Föll migrationen kör den gamla versionen fortfarande, men databasen kan vara delvis ändrad."
fi

# --- 5. Kontroll -------------------------------------------------------------
step "Väntar på att $VERSION svarar"

HEALTHY=""
HEALTH=""
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
  fail "$VERSION svarar inte efter 90 sekunder. Backa med: ./ops/release.sh $ROLLBACK"
fi

# Versionen skrivs i .env först nu. En omstart av servern, eller ett
# "docker compose up -d" för hand, ska starta det som faktiskt fungerar.
if grep -q "^$VERSION_VAR=" .env; then
  sed -i "s|^$VERSION_VAR=.*|$VERSION_VAR=$VERSION|" .env
else
  printf '\n# Satt av ops/release.sh. Ändras inte för hand.\n%s=%s\n' "$VERSION_VAR" "$VERSION" >> .env
fi

echo "  $HEALTH"
echo
docker compose ps

# Tre äldre versioner räcker att backa till. Listan kommer nyast först. "|| true":
# finns inget att städa svarar grep med en felkod, och den får inte stoppa en
# driftsättning som redan lyckats.
for IMAGE_NAME in "$APP_IMAGE" "$MIGRATE_IMAGE"; do
  OLD_TAGS="$(docker image ls "$IMAGE_NAME" --format '{{.Tag}}' \
    | grep -vx -e "$VERSION" -e dev -e '<none>' \
    | tail -n +4 || true)"
  for OLD in $OLD_TAGS; do
    docker image rm "$IMAGE_NAME:$OLD" >/dev/null 2>&1 || true
  done
done

step "Klart: $VERSION kör"
echo "  Säkerhetskopia före driftsättningen: ${BACKUP_FILE:-(ingen hittad)}"
echo "  Backa vid behov:                      ./ops/release.sh $ROLLBACK"
echo

if [ -n "${POST_RELEASE_HOOK:-}" ] && [ -f "$POST_RELEASE_HOOK" ]; then
  bash "$POST_RELEASE_HOOK" "$VERSION" "$ENVIRONMENT" || true
fi
