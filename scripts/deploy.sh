#!/usr/bin/env bash
# Production deploy to Cloudflare Workers: schema, build, ship. `npm run deploy`.
#
# 1. Applies lib/schema.sql to the PRODUCTION database before anything ships,
#    so a deploy can never serve code ahead of its schema. The schema is
#    idempotent and only ever adds things, so re-running it is a no-op and the
#    version still serving traffic keeps working against it. If the migration
#    fails, nothing is built or deployed and the current version stays live.
# 2. Builds the Worker with OpenNext.
# 3. Deploys it to the `house-ladder` Worker.
#
# The production connection string comes from PROD_DATABASE_URL, either
# exported in the shell or in a gitignored `.env.deploy` file
# (PROD_DATABASE_URL=postgresql://...). Never from .env.local, which points at
# the local database.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${PROD_DATABASE_URL:-}" ] && [ -f .env.deploy ]; then
  PROD_DATABASE_URL="$(grep '^PROD_DATABASE_URL=' .env.deploy | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
fi
if [ -z "${PROD_DATABASE_URL:-}" ]; then
  echo "deploy: set PROD_DATABASE_URL (or put it in .env.deploy) to the production database" >&2
  exit 1
fi
case "$PROD_DATABASE_URL" in
  *@localhost*|*@127.0.0.1*|*@\[::1\]*|*@0.0.0.0*)
    echo "deploy: PROD_DATABASE_URL points at a local database; refusing to deploy" >&2
    exit 1
    ;;
esac

echo "deploy: applying lib/schema.sql to production"
DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/migrate.ts

npx opennextjs-cloudflare build

# OpenNext copies every value from the .env* files it finds (.env.local
# included) into the bundle as fallbacks. Production reads everything from
# the Worker's secrets, so ship none of them.
printf 'export const production = {};\nexport const development = {};\nexport const test = {};\n' \
  > .open-next/cloudflare/next-env.mjs

npx opennextjs-cloudflare deploy
