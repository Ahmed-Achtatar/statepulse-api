param(
  [string]$Url = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"
$failures = 0

function Test-Status {
  param(
    [string]$Label,
    [string]$Path,
    [int]$Expected = 200
  )

  try {
    $response = Invoke-WebRequest -Uri "$Url$Path" -UseBasicParsing -TimeoutSec 20
    $status = [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
    } else {
      Write-Host "Fail: $Label request failed: $($_.Exception.Message)"
      $script:failures++
      return
    }
  }

  if ($status -eq $Expected) {
    Write-Host "Success: $Label returned $status"
  } else {
    Write-Host "Fail: $Label returned $status, expected $Expected"
    $script:failures++
  }
}

function Test-Contains {
  param(
    [string]$Label,
    [string]$Path,
    [string]$Expected
  )

  try {
    $body = (Invoke-WebRequest -Uri "$Url$Path" -UseBasicParsing -TimeoutSec 20).Content
  } catch {
    Write-Host "Fail: $Label request failed: $($_.Exception.Message)"
    $script:failures++
    return
  }

  if ($body.Contains($Expected)) {
    Write-Host "Success: $Label contains $Expected"
  } else {
    Write-Host "Fail: $Label missing $Expected"
    $script:failures++
  }
}

function Test-NotContains {
  param(
    [string]$Label,
    [string]$Path,
    [string]$Unexpected
  )

  try {
    $body = (Invoke-WebRequest -Uri "$Url$Path" -UseBasicParsing -TimeoutSec 20).Content
  } catch {
    Write-Host "Fail: $Label request failed: $($_.Exception.Message)"
    $script:failures++
    return
  }

  if (-not $body.Contains($Unexpected)) {
    Write-Host "Success: $Label does not contain $Unexpected"
  } else {
    Write-Host "Fail: $Label still contains $Unexpected"
    $script:failures++
  }
}

function Test-PaymentChallenge {
  param(
    [string]$Label,
    [string]$Path,
    [string]$Payload,
    [string]$ExpectedAmount
  )

  try {
    $response = Invoke-WebRequest -Uri "$Url$Path" -Method POST -ContentType "application/json" -Body $Payload -UseBasicParsing -TimeoutSec 20
    $status = [int]$response.StatusCode
    $body = $response.Content
    $header = $response.Headers["PAYMENT-REQUIRED"]
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $header = $_.Exception.Response.Headers["PAYMENT-REQUIRED"]
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $body = $reader.ReadToEnd()
    } else {
      Write-Host "Fail: $Label request failed: $($_.Exception.Message)"
      $script:failures++
      return
    }
  }

  $challenge = ""
  if ($header) {
    $padded = $header
    while ($padded.Length % 4 -ne 0) {
      $padded += "="
    }
    $challenge = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($padded))
  }

  $bodyHasLegacyAmount = $body.Contains("""maxAmountRequired"":""$ExpectedAmount""")
  $headerHasV2Amount = $challenge.Contains("""amount"":""$ExpectedAmount""")

  if ($status -eq 402 -and ($bodyHasLegacyAmount -or $headerHasV2Amount)) {
    Write-Host "Success: $Label returned 402 & $ExpectedAmount"
  } else {
    Write-Host "Fail: $Label did not return x402 amount $ExpectedAmount"
    $script:failures++
  }
}

Write-Host "Testing $Url"
Write-Host ""

$ExpectedEndpointPaths = @(
  "/product/barcode",
  "/airspace/track",
  "/environment/air-quality",
  "/transit/status",
  "/weather/anomaly",
  "/radio/stream-url",
  "/network/dns-propagation",
  "/brand/assets",
  "/prediction/odds",
  "/water/streamflow",
  "/calendar/holidays",
  "/network/whois",
  "/network/ip-lookup",
  "/finance/company-lookup"
)

Write-Host "1. Health check"
Test-Status "homepage" "/"
Test-Status "try page" "/try"
Test-Status "health" "/health"
Write-Host ""

Write-Host "2. Trust endpoints"
Test-Status "logo.svg" "/logo.svg"
Test-Status "terms" "/terms"
Test-Status "privacy" "/privacy"
Write-Host ""

Write-Host "3. Discovery metadata"
Test-Status "metadata.json" "/metadata.json"
Test-Status "agenterc metadata" "/agenterc-metadata.json"
Test-Status "agent registration well-known" "/.well-known/agent-registration.json"
Test-Status "agent-card" "/.well-known/agent-card.json"
Test-Status "agent.json" "/.well-known/agent.json"
Test-Status "x402.json" "/.well-known/x402.json"
Test-Status "mcp.json" "/.well-known/mcp.json"
Test-Status "x402 discovery" "/x402/discovery"
Test-Status "oasf.json" "/.well-known/oasf.json"
Test-Status "llms.txt" "/llms.txt"
Test-Status "well-known llms.txt" "/.well-known/llms.txt"
Test-Status "openapi.json" "/openapi.json"
foreach ($path in $ExpectedEndpointPaths) {
  Test-Status "endpoint info $path" $path
}
Test-Status "a2a service GET" "/a2a"
Test-Status "a2a card GET" "/a2a/card"
Test-Status "mcp service GET" "/mcp"
Test-Status "oasf service GET" "/oasf"
Test-Contains "homepage" "/" "StatePulse API"
Test-Contains "openapi" "/openapi.json" "/weather/anomaly"
Test-Contains "openapi" "/openapi.json" "/product/barcode"
foreach ($path in $ExpectedEndpointPaths) {
  Test-Contains "openapi endpoint $path" "/openapi.json" $path
  Test-Contains "llms endpoint $path" "/llms.txt" "POST $Url$path"
}
Test-Contains "x402 metadata" "/.well-known/x402.json" "20000"
Test-Contains "llms.txt" "/llms.txt" "POST $Url/weather/anomaly"
Test-Contains "llms.txt" "/llms.txt" 'Price: $0.030'
Test-Contains "agent-card" "/.well-known/agent-card.json" "lookup_barcode"
Test-Contains "agent-card" "/.well-known/agent-card.json" "track_airspace"
Test-Contains "mcp.json" "/.well-known/mcp.json" "2025-06-18"
Test-Contains "oasf.json" "/.well-known/oasf.json" "schema_version"
Test-NotContains "openapi" "/openapi.json" "/diff"
Test-NotContains "openapi" "/openapi.json" "/enrich"
Write-Host ""

Write-Host "4. Payment challenge"
Test-PaymentChallenge "weather anomaly" "/weather/anomaly" '{"lat":40.71,"lng":-74.00}' "30000"
Test-PaymentChallenge "barcode lookup" "/product/barcode" '{"barcode":"9780140449136"}' "20000"
foreach ($path in $ExpectedEndpointPaths) {
  # Special pricing mapping
  $expectedPrice = "30000"
  if ($path -eq "/radio/stream-url" -or $path -eq "/network/dns-propagation" -or $path -eq "/calendar/holidays") {
    $expectedPrice = "10000"
  } elseif ($path -eq "/product/barcode" -or $path -eq "/brand/assets" -or $path -eq "/prediction/odds" -or $path -eq "/network/ip-lookup") {
    $expectedPrice = "20000"
  } elseif ($path -eq "/network/whois") {
    $expectedPrice = "40000"
  } elseif ($path -eq "/finance/company-lookup") {
    $expectedPrice = "100000"
  }
  
  $payload = '{}'
  if ($path -eq "/product/barcode") { $payload = '{"barcode":"9780140449136"}' }
  elseif ($path -eq "/airspace/track") { $payload = '{"icao24":"a8677c"}' }
  elseif ($path -eq "/environment/air-quality") { $payload = '{"lat":40.7128,"lng":-74.0060}' }
  elseif ($path -eq "/transit/status") { $payload = '{"city":"nyc","line":"L"}' }
  elseif ($path -eq "/weather/anomaly") { $payload = '{"lat":40.7128,"lng":-74.0060}' }
  elseif ($path -eq "/radio/stream-url") { $payload = '{"country":"Morocco","genre":"news"}' }
  elseif ($path -eq "/network/dns-propagation") { $payload = '{"domain":"google.com","type":"MX"}' }
  elseif ($path -eq "/brand/assets") { $payload = '{"domain":"google.com"}' }
  elseif ($path -eq "/prediction/odds") { $payload = '{"contract_id":"1234"}' }
  elseif ($path -eq "/water/streamflow") { $payload = '{"state":"CA"}' }
  elseif ($path -eq "/calendar/holidays") { $payload = '{"year":2026,"country_code":"US"}' }
  elseif ($path -eq "/network/whois") { $payload = '{"domain":"google.com"}' }
  elseif ($path -eq "/network/ip-lookup") { $payload = '{"ip":"8.8.8.8"}' }
  elseif ($path -eq "/finance/company-lookup") { $payload = '{"company_name":"Apple"}' }

  Test-PaymentChallenge "payment challenge $path" $path $payload $expectedPrice
}
Write-Host ""

if ($failures -gt 0) {
  Write-Host "$failures check(s) failed"
  exit 1
}

Write-Host "All checks passed"
