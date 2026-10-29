#!/usr/bin/env bash
# Builds the image and boots each documented compose setup from it: sqld, PostgreSQL and a SQLite file. For each it
# waits for core to report itself and its database up, signs the first account up (the owner), and makes core fetch
# its own signing keys from its public address from inside its container, which is what checking an
# `id_token_hint` needs (core-app §3.6.5). The image is checked for an environment file baked in, and for starting
# without one: it must refuse, saying what is missing.
#
# Run: `pnpm docker:smoke` (needs Docker). It takes a few minutes, mostly the build. CI runs it on every change.
set -euo pipefail
cd "$(dirname "$0")/.."

export SV_IMAGE="${SV_IMAGE:-sovereign-core:smoke}"
export SV_URL=http://localhost:3000
export SV_PORT=3000
SV_AUTH_SECRET="$(openssl rand -base64 48)"
SV_POSTGRES_PASSWORD="$(openssl rand -hex 12)"
export SV_AUTH_SECRET SV_POSTGRES_PASSWORD
PASSWORD="smoke-$(openssl rand -hex 8)-Zt7"

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== building $SV_IMAGE"
docker build -t "$SV_IMAGE" .

echo "== the image carries no environment file"
leftovers="$(docker run --rm --entrypoint sh "$SV_IMAGE" -c \
  'find / -name ".env*" -not -path "/proc/*" -not -path "/sys/*" -not -path "*/node_modules/*" 2>/dev/null || true')"
[ -z "$leftovers" ] || fail "the image holds environment files: $leftovers"

echo "== the image refuses to start with nothing, and says why"
refusal="$(docker run --rm "$SV_IMAGE" 2>&1 || true)"
grep -q "SV_URL is required" <<<"$refusal" || fail "no clear refusal: $refusal"
grep -q "SV_AUTH_SECRET is required" <<<"$refusal" || fail "no clear refusal: $refusal"

# The first account may sign up before mail is set up only when verification is off; `.env` is how an operator
# gives core settings, so that is how this does.
trap 'rm -f .env; for f in docker-compose.yml "docker-compose.yml -f docker-compose.postgres.yml" docker-compose.sqlite.yml; do docker compose -f ${f} down -v >/dev/null 2>&1 || true; done' EXIT
printf 'SV_AUTH_REQUIRE_EMAIL_VERIFICATION=false\n' > .env

smoke() {
  local name="$1"; shift
  echo "== $name"
  docker compose "$@" up -d
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$SV_URL/api/health")" = 200 ] && break
    sleep 2
  done
  health="$(curl -s "$SV_URL/api/health")"
  [ "$health" = '{"status":"ok","app":"up","database":"up"}' ] || {
    docker compose "$@" logs core >&2
    fail "$name is not healthy: $health"
  }
  role="$(curl -s -X POST "$SV_URL/api/auth/sign-up/email" -H 'content-type: application/json' -H "origin: $SV_URL" \
    -d "{\"name\":\"Smoke Owner\",\"email\":\"owner@example.test\",\"password\":\"$PASSWORD\",\"agreedToTerms\":true}" \
    | sed -n 's/.*"role":"\([^"]*\)".*/\1/p')"
  [ "$role" = platform:owner ] || fail "$name: the first account is not the owner ($role)"
  docker compose "$@" exec -T core node -e \
    "fetch('$SV_URL/api/auth/jwks').then(r=>r.json()).then(j=>process.exit(Array.isArray(j.keys)&&j.keys.length?0:1)).catch(()=>process.exit(1))" \
    || fail "$name: core cannot reach its own address from inside its container"
  docker compose "$@" down -v
}

smoke "sqld" -f docker-compose.yml
smoke "PostgreSQL" -f docker-compose.yml -f docker-compose.postgres.yml
smoke "a SQLite file" -f docker-compose.sqlite.yml
echo "== all three boot from the documented variables"
