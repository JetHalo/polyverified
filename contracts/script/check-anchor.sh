#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/apps/polymarket-signals/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${ANCHOR_RPC_URL:?ANCHOR_RPC_URL is required}"
: "${ANCHOR_CONTRACT_ADDRESS:?ANCHOR_CONTRACT_ADDRESS is required}"

cast code "$ANCHOR_CONTRACT_ADDRESS" --rpc-url "$ANCHOR_RPC_URL"

