#!/usr/bin/env bash

set -euo pipefail

cd /app

APP_RUNTIME="${APP_RUNTIME:-web}"
AUTO_DB_INIT="${AUTO_DB_INIT:-true}"

if [[ "$AUTO_DB_INIT" == "true" && -n "${DATABASE_URL:-}" ]]; then
  npm run db:init -w @x402/polymarket-signals
fi

case "$APP_RUNTIME" in
  web)
    exec npm run start -w @x402/polymarket-signals -- --port "${PORT:-3000}"
    ;;
  worker)
    if [[ -z "${APP_BASE_URL:-}" ]]; then
      echo "APP_BASE_URL is required when APP_RUNTIME=worker" >&2
      exit 1
    fi
    exec npm run tick:watch -w @x402/polymarket-signals
    ;;
  *)
    echo "Unsupported APP_RUNTIME: $APP_RUNTIME" >&2
    exit 1
    ;;
esac
