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

PAYMENT_RPC_URL="${PAYMENT_RPC_URL:-${ANCHOR_RPC_URL:-}}"
PAYMENT_DEPLOY_KEY="${PAYMENT_DEPLOYER_PRIVATE_KEY:-${ANCHOR_SIGNER_PRIVATE_KEY:-${ANCHOR_DEPLOYER_PRIVATE_KEY:-}}}"

: "${PAYMENT_RPC_URL:?PAYMENT_RPC_URL or ANCHOR_RPC_URL is required}"
: "${PAYMENT_DEPLOY_KEY:?PAYMENT_DEPLOYER_PRIVATE_KEY, ANCHOR_SIGNER_PRIVATE_KEY, or ANCHOR_DEPLOYER_PRIVATE_KEY is required}"

cd "$CONTRACTS_DIR"

forge create src/USDZ.sol:USDZ \
  --rpc-url "$PAYMENT_RPC_URL" \
  --private-key "$PAYMENT_DEPLOY_KEY" \
  --broadcast \
  "$@"
