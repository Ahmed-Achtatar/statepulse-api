#!/bin/bash

error_exit() {
  echo ""
  echo "An error occurred in the setup process."
  echo "Press Enter to close this window..."
  read
  exit 1
}
trap 'error_exit' ERR

echo ""
echo "========================================"
echo "  PageDiff API - Deployment Setup"
echo "========================================"
echo ""

if [ ! -d "node_modules" ]; then
  echo "Installing project dependencies..."
  npm install
fi

WRANGLER_CMD=""
if command -v wrangler &> /dev/null; then
  WRANGLER_CMD="wrangler"
elif [ -f "./node_modules/.bin/wrangler" ]; then
  WRANGLER_CMD="npx wrangler"
else
  echo "Wrangler not found. Installing it locally..."
  npm install -D wrangler
  WRANGLER_CMD="npx wrangler"
fi

echo "Enter your MetaMask wallet address (Base network)"
echo "(starts with 0x... - copy it from MetaMask with Base selected)"
echo -n "> "
read WALLET_ADDR
echo ""

if [[ ! "$WALLET_ADDR" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "ERROR: Invalid wallet address format. Must start with 0x followed by 40 hex characters."
  echo "Press Enter to exit..."
  read
  exit 1
fi

echo ""
echo "Setting secrets in Cloudflare..."
echo "$WALLET_ADDR" | $WRANGLER_CMD secret put WALLET_ADDRESS --quiet

echo "Deploying to Cloudflare Workers..."
$WRANGLER_CMD deploy

echo ""
echo "========================================"
echo "  Deployment complete!"
echo "========================================"
echo ""
echo "Press Enter to close this window..."
read
