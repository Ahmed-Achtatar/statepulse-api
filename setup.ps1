$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================"
Write-Host "  StatePulse API - Deployment Setup"
Write-Host "========================================"
Write-Host ""

# Ensure dependencies are installed
if (!(Test-Path "node_modules")) {
    Write-Host "Installing project dependencies..."
    npm install
}

# Locate Wrangler (check global first, then local)
$wranglerCmd = ""
if (Get-Command wrangler -ErrorAction SilentlyContinue) {
    $wranglerCmd = "wrangler"
} elseif (Test-Path ".\node_modules\.bin\wrangler.ps1") {
    $wranglerCmd = ".\node_modules\.bin\wrangler.ps1"
} elseif (Test-Path ".\node_modules\.bin\wrangler.cmd") {
    $wranglerCmd = ".\node_modules\.bin\wrangler.cmd"
} else {
    Write-Host "Wrangler not found. Installing it locally..."
    npm install -D wrangler
    $wranglerCmd = "npx wrangler"
}

# Get credentials from user
Write-Host "Enter your MetaMask wallet address (Base network)"
Write-Host "(starts with 0x... - copy it from MetaMask with Base selected)"
$walletAddr = Read-Host -Prompt "> "

# Validate wallet address format
if ($walletAddr -notmatch "^0x[a-fA-F0-9]{40}$") {
    Write-Host "ERROR: Invalid wallet address format. Must start with 0x followed by 40 hex characters."
    Read-Host "Press Enter to exit..."
    exit
}

Write-Host ""
Write-Host "Setting secrets in Cloudflare..."
$walletAddr | &$wranglerCmd secret put WALLET_ADDRESS

Write-Host "Deploying to Cloudflare Workers..."
&$wranglerCmd deploy

Write-Host ""
Write-Host "========================================"
Write-Host "  Deployment complete!"
Write-Host "========================================"
Write-Host ""
Read-Host "Press Enter to close this window..."
