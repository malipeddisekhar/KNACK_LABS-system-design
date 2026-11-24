# Module 08 Smoke Verification Script (PowerShell 5.1)
param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [int]$MaxAttempts = 15,
  [int]$DelaySeconds = 2
)

Write-Host "Starting deployment smoke verification against $BaseUrl..."

$readyPassed = $false
for ($i = 1; $i -le $MaxAttempts; $i++) {
  try {
    $resp = curl.exe --silent --show-error --include --max-time 3 "$BaseUrl/ready" 2>&1
    if ($resp -match "HTTP/1.1 200" -or $resp -match "HTTP/2 200") {
      Write-Host "Readiness check passed on attempt $i."
      $readyPassed = $true
      break
    }
    Write-Host "Attempt $i: /ready not ready yet, waiting ${DelaySeconds}s..."
  } catch {
    Write-Host "Attempt $i: connection error, waiting ${DelaySeconds}s..."
  }
  Start-Sleep -Seconds $DelaySeconds
}

if (-not $readyPassed) {
  Write-Error "DEPLOYMENT_FAILED: /ready failed to return HTTP 200 within $($MaxAttempts * $DelaySeconds)s. Trigger automated rollback."
  exit 1
}

# Liveness probe check
$liveResp = curl.exe --silent --show-error --max-time 3 "$BaseUrl/health" 2>&1
if ($liveResp -notmatch '"ok":\s*true') {
  Write-Error "DEPLOYMENT_FAILED: /health returned invalid response: $liveResp"
  exit 1
}
Write-Host "Liveness (/health) verified: $liveResp"

# Metrics probe check
$metricsCode = curl.exe --silent --show-error --output NUL --write-out "%{http_code}" --max-time 3 "$BaseUrl/metrics" 2>&1
if ($metricsCode -ne "200") {
  Write-Error "DEPLOYMENT_FAILED: /metrics returned HTTP $metricsCode"
  exit 1
}
Write-Host "Metrics (/metrics) verified: HTTP 200"

Write-Host "All post-deployment smoke verification checks passed."
exit 0
