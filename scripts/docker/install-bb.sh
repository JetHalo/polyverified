#!/usr/bin/env bash

set -euo pipefail

BB_VERSION="${1:-0.84.0}"
INSTALL_DIR="${BB_INSTALL_DIR:-/opt/bb}"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) BB_ARCH="amd64" ;;
  aarch64|arm64) BB_ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

PLATFORM="$(uname | tr '[:upper:]' '[:lower:]')"
if [[ "$PLATFORM" != "linux" && "$PLATFORM" != "darwin" ]]; then
  echo "Unsupported platform: $PLATFORM" >&2
  exit 1
fi

TARBALL_URL="https://github.com/AztecProtocol/aztec-packages/releases/download/v${BB_VERSION}/barretenberg-${BB_ARCH}-${PLATFORM}.tar.gz"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$INSTALL_DIR"
curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/bb.tar.gz"
tar -xzf "$TMP_DIR/bb.tar.gz" -C "$INSTALL_DIR"
ln -sf "$INSTALL_DIR/bb" /usr/local/bin/bb
