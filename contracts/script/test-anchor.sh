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
: "${ANCHOR_SIGNER_PRIVATE_KEY:?ANCHOR_SIGNER_PRIVATE_KEY is required}"

TEST_COMMITMENT="${TEST_COMMITMENT:-$(cast keccak "demo-commitment-1")}"
TEST_SIGNAL_ID_HASH="${TEST_SIGNAL_ID_HASH:-$(cast keccak "demo-signal-1")}"
TEST_PREDICTED_AT="${TEST_PREDICTED_AT:-$(date -u +%s)}"

cast send "$ANCHOR_CONTRACT_ADDRESS" \
  "anchor(bytes32,bytes32,uint64)" \
  "$TEST_COMMITMENT" \
  "$TEST_SIGNAL_ID_HASH" \
  "$TEST_PREDICTED_AT" \
  --rpc-url "$ANCHOR_RPC_URL" \
  --private-key "$ANCHOR_SIGNER_PRIVATE_KEY"

