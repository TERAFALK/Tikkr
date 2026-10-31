#!/usr/bin/env bash
# shellcheck disable=SC2034  # Variablerna läses av skripten som läser in filen.
# Det som alla skript i driftkitet delar. Läses med `source`, körs aldrig själv.
#
# Allt appspecifikt står i ops/app.conf och i serverns .env. Filerna i ops/ utom
# app.conf och hooks/ är kopior ur tf-framework och ändras inte i appen, se
# ops/verify.mjs.

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mSTOPP:\033[0m %s\n\n' "$1" >&2; exit 1; }

# Läser app.conf och .env. Efter det här gäller:
#
#   APP_SLUG         appens korta namn, till exempel "tikkr"
#   ENV_PREFIX       prefixet på miljö- och versionsvariablerna, förval APP
#   ENVIRONMENT      "production" eller "lab"
#   VERSION_VAR      variabeln i .env som bär versionen, till exempel APP_VERSION
#   DB_USER, DB_NAME databasens användare och namn
#   BACKUP_PREFIX    filnamnets början på säkerhetskopiorna
#   HEALTH_URL       hälsokontrollen, lokalt på servern
ops_load() {
  local repo="$1"

  [ -f "$repo/ops/app.conf" ] || fail "Hittar ingen ops/app.conf i $repo."
  # shellcheck disable=SC1091
  . "$repo/ops/app.conf"

  [ -n "${APP_SLUG:-}" ] || fail "APP_SLUG saknas i ops/app.conf."

  if [ -f "$repo/.env" ]; then
    # shellcheck disable=SC1091
    set -a; . "$repo/.env"; set +a
  fi

  ENV_PREFIX="${ENV_PREFIX:-APP}"
  VERSION_VAR="${ENV_PREFIX}_VERSION"

  local env_var="${ENV_PREFIX}_ENV"
  ENVIRONMENT="${!env_var:-lab}"

  DB_USER="${POSTGRES_USER:-$APP_SLUG}"
  DB_NAME="${POSTGRES_DB:-$APP_SLUG}"
  BACKUP_PREFIX="${BACKUP_PREFIX:-$APP_SLUG}"
  HEALTH_PATH="${HEALTH_PATH:-/api/health}"
  HEALTH_URL="http://127.0.0.1:${APP_PORT:-3000}${HEALTH_PATH}"
}
