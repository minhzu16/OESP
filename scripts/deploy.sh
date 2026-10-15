#!/bin/sh
# Usage (on the server, in /opt/exam):  REGISTRY=ghcr.io/org DOMAIN=exam.example.com sh scripts/deploy.sh <tag>
# Pulls the new images, runs migrations, restarts services and rolls back if /api/health fails.
set -eu

NEW_TAG="$1"
COMPOSE="docker compose -f docker-compose.prod.yml"
PREV_TAG="$(cat .deployed_tag 2>/dev/null || true)"

deploy() {
  TAG="$1" $COMPOSE pull api web
  TAG="$1" $COMPOSE up -d --remove-orphans
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS "https://${DOMAIN}/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

echo "Deploying ${NEW_TAG} (previous: ${PREV_TAG:-none})"
deploy "$NEW_TAG"
if healthy; then
  echo "$NEW_TAG" > .deployed_tag
  echo "Deployed ${NEW_TAG}"
  docker image prune -f >/dev/null
else
  echo "Health check failed for ${NEW_TAG}" >&2
  if [ -n "$PREV_TAG" ]; then
    echo "Rolling back to ${PREV_TAG}" >&2
    deploy "$PREV_TAG"
  fi
  exit 1
fi
