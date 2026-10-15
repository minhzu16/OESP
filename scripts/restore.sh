#!/bin/sh
# Restore a dump into a SEPARATE scratch database to verify backups (monthly restore drill):
#   sh scripts/restore.sh backups/exam-20261001T020000Z.dump
# It never touches the live "exam" database.
set -eu

DUMP="$1"
TARGET="${TARGET_DB:-exam_restore_check}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml}"

if [ "$TARGET" = "exam" ]; then
  echo "Refusing to restore over the live database" >&2
  exit 1
fi

$COMPOSE exec -T postgres dropdb -U exam --if-exists "$TARGET"
$COMPOSE exec -T postgres createdb -U exam "$TARGET"
$COMPOSE exec -T postgres pg_restore -U exam -d "$TARGET" --no-owner < "$DUMP"
$COMPOSE exec -T postgres psql -U exam -d "$TARGET" -c \
  "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM attempts) AS attempts, (SELECT count(*) FROM results) AS results;"
echo "Restore check OK into database ${TARGET}"
