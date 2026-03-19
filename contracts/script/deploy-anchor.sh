#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/apps/polymarket-signals/.env}"
CONTRACTS_DIR="$ROOT_DIR/contracts"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

: "${ANCHOR_RPC_URL:?ANCHOR_RPC_URL is required}"
ANCHOR_DEPLOY_KEY="${ANCHOR_DEPLOYER_PRIVATE_KEY:-${ANCHOR_SIGNER_PRIVATE_KEY:-}}"
: "${ANCHOR_DEPLOY_KEY:?ANCHOR_DEPLOYER_PRIVATE_KEY or ANCHOR_SIGNER_PRIVATE_KEY is required}"

cd "$CONTRACTS_DIR"

forge create src/AnchorRegistry.sol:AnchorRegistry \
  --rpc-url "$ANCHOR_RPC_URL" \
  --private-key "$ANCHOR_DEPLOY_KEY" \
  --broadcast \
  "$@"
