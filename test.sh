#!/bin/bash
set -u

URL=${1:-"http://localhost:8787"}
failures=0

check_status() {
  local label="$1"
  local path="$2"
  local expected="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$URL$path")
  if [ "$status" = "$expected" ]; then
    echo "Success: $label returned $status"
  else
    echo "Fail: $label returned $status, expected $expected"
    failures=$((failures + 1))
  fi
}

check_contains() {
  local label="$1"
  local path="$2"
  local expected="$3"
  local body
  body=$(curl -s "$URL$path")
  if echo "$body" | grep -q "$expected"; then
    echo "Success: $label contains $expected"
  else
    echo "Fail: $label missing $expected"
    failures=$((failures + 1))
  fi
}

check_not_contains() {
  local label="$1"
  local path="$2"
  local unexpected="$3"
  local body
  body=$(curl -s "$URL$path")
  if echo "$body" | grep -q "$unexpected"; then
    echo "Fail: $label still contains $unexpected"
    failures=$((failures + 1))
  else
    echo "Success: $label does not contain $unexpected"
  fi
}

check_payment_challenge() {
  local label="$1"
  local path="$2"
  local payload="$3"
  local expected_amount="$4"
  local response header decoded status
  response=$(curl -s -i -X POST "$URL$path" \
    -H "Content-Type: application/json" \
    -d "$payload")
  status=$(echo "$response" | awk 'NR==1 {print $2}')
  header=$(echo "$response" | awk 'BEGIN{IGNORECASE=1} /^payment-required:/ {sub(/^[^:]+:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}')
  decoded=$(python3 - "$header" 2>/dev/null <<'PY'
import base64
import sys

value = sys.argv[1] if len(sys.argv) > 1 else ""
if not value:
    print("")
    raise SystemExit(0)
value += "=" * (-len(value) % 4)
print(base64.b64decode(value).decode("utf-8"))
PY
)
  if [ "$status" = "402" ] && { echo "$response" | grep -q "\"maxAmountRequired\":\"$expected_amount\"" || echo "$decoded" | grep -q "\"amount\":\"$expected_amount\""; }; then
    echo "Success: $label returned 402 & $expected_amount"
  else
    echo "Fail: $label did not return x402 amount $expected_amount"
    failures=$((failures + 1))
  fi
}

echo "Testing $URL"
echo ""

echo "1. Health check"
check_status "homepage" "/"
check_status "health" "/health"
echo ""

echo "2. Trust endpoints"
check_status "logo.svg" "/logo.svg"
check_status "terms" "/terms"
check_status "privacy" "/privacy"
echo ""

echo "3. Discovery metadata"
check_status "metadata.json" "/metadata.json"
check_status "agenterc metadata" "/agenterc-metadata.json"
check_status "agent registration well-known" "/.well-known/agent-registration.json"
check_status "agent-card" "/.well-known/agent-card.json"
check_status "agent.json" "/.well-known/agent.json"
check_status "x402.json" "/.well-known/x402.json"
check_status "mcp.json" "/.well-known/mcp.json"
check_status "x402 discovery" "/x402/discovery"
check_status "oasf.json" "/.well-known/oasf.json"
check_status "openapi.json" "/openapi.json"
check_status "a2a service GET" "/a2a"
check_status "a2a card GET" "/a2a/card"
check_status "mcp service GET" "/mcp"
check_status "oasf service GET" "/oasf"
check_contains "homepage" "/" "StatePulse API"
check_contains "openapi" "/openapi.json" "/weather/anomaly"
check_contains "openapi" "/openapi.json" "/product/barcode"
check_contains "x402 metadata" "/.well-known/x402.json" "30000"
check_contains "agent-card" "/.well-known/agent-card.json" "lookup_barcode"
check_contains "agent-card" "/.well-known/agent-card.json" "track_airspace"
check_contains "mcp.json" "/.well-known/mcp.json" "2025-06-18"
check_contains "oasf.json" "/.well-known/oasf.json" "schema_version"
check_not_contains "openapi" "/openapi.json" "/diff"
check_not_contains "openapi" "/openapi.json" "/enrich"
echo ""

echo "4. Payment challenge"
check_payment_challenge "weather anomaly" "/weather/anomaly" '{"lat":40.71,"lng":-74.00}' "30000"
check_payment_challenge "barcode lookup" "/product/barcode" '{"barcode":"9780140449136"}' "30000"
echo ""

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi

echo "All checks passed"
