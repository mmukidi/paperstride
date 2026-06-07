#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Edit .env before deploying, then run this script again."
  exit 1
fi

echo "Before deploying, confirm docs/FEATURE_STATUS.md reflects this release."
if command -v npm >/dev/null 2>&1 && [ -d node_modules ]; then
  npm run predeploy
else
  echo "Skipping npm predeploy check because npm or node_modules is unavailable on this host."
  echo "Run 'npm run predeploy' before pushing from a development machine."
fi

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

compose up -d --build
docker image prune -f
compose ps
