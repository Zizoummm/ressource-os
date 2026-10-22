#!/usr/bin/env bash
set -euo pipefail
cd /workspace/ressource-os
node scripts/init-resourceos.mjs
docker compose up -d --wait db
if [ -f .data/resourceos-snapshot.sql ]; then
  resourceos_schema_present=$(docker compose exec -T db psql -U resourceos -d resourceos -Atqc "SELECT to_regclass('public.\"Organization\"') IS NOT NULL")
  if [ "$resourceos_schema_present" = "f" ]; then
    docker compose exec -T db psql -U resourceos -d resourceos --set ON_ERROR_STOP=on --single-transaction < .data/resourceos-snapshot.sql > /tmp/resourceos-restore.log
  fi
fi
npm run db:generate
npm run db:migrate
npm run db:seed
exec npm run dev
