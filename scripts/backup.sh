#!/usr/bin/env bash
set -euo pipefail
cd /workspace/ressource-os
mkdir -p .data
umask 077
docker compose exec -T db pg_dump -U resourceos -d resourceos --no-owner --no-acl > .data/resourceos-snapshot.sql.tmp
mv .data/resourceos-snapshot.sql.tmp .data/resourceos-snapshot.sql
