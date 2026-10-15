#!/bin/sh
# Daily logical backup of the production database (run from cron on the server):
#   0 2 * * * cd /opt/exam && sh scripts/backup.sh >> backups/backup.log 2>&1
# Keeps the last $KEEP_DAYS dumps locally; ship ./backups to object storage (S3/R2/B2) with rclone or similar.
set -eu

KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml}"
mkdir -p backups
FILE="backups/exam-$(date -u +%Y%m%dT%H%M%SZ).dump"

$COMPOSE exec -T postgres pg_dump -U exam -d exam --format=custom --no-owner > "$FILE"
echo "$(date -u +%FT%TZ) wrote $FILE ($(du -h "$FILE" | cut -f1))"

find backups -name 'exam-*.dump' -mtime +"$KEEP_DAYS" -delete
