param(
    [string]$ConfigPath = "$env:LOCALAPPDATA\StudioFlow\space-design-e2e\wordpress-private.php"
)

$ErrorActionPreference = 'Stop'
try {
    # Read only the dedicated local handoff file; never echo its contents.
    $content = [IO.File]::ReadAllText($ConfigPath)
    $secret = [regex]::Match($content, "define\('SD_STUDIOFLOW_HMAC_SECRET', '([a-f0-9]{64})'\);").Groups[1].Value
    if ($secret.Length -ne 64) { throw 'Missing local test secret' }
    $keyId = 'space-design-e2e-local'
    if (-not $content.Contains("define('SD_STUDIOFLOW_KEY_ID', '$keyId');")) { throw 'Unexpected test key' }
    $base = 'http://127.0.0.1:3100'
    if (-not $content.Contains("define('SD_STUDIOFLOW_BASE_URL', '$base');")) { throw 'Only loopback is allowed' }
    $id = [guid]::NewGuid().ToString()
    $path = '/api/integrations/space-design/leads'
    $payload = [ordered]@{
        schema_version = 1; submission_id = $id; submitted_at = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
        form_id = 7153; form_location = 'modal'; language = 'uk'
        page_url = 'http://space-design.local/e2e'; client_name = 'Windows loopback E2E fixture'
        phone = $null; email = "windows-$id@example.test"
    }
    $raw = $payload | ConvertTo-Json -Compress
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
    try {
        $bytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$timestamp`nPOST`n$path`n$raw"))
        $signature = 'sha256=' + [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    } finally { $hmac.Dispose() }
    $headers = @{
        'X-SD-Key-Id' = $keyId; 'X-SD-Timestamp' = $timestamp
        'Idempotency-Key' = $id; 'X-SD-Signature' = $signature
    }
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$base$path" -Method Post -ContentType 'application/json; charset=utf-8' `
        -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($raw)) -TimeoutSec 60 -MaximumRedirection 0
    $receipt = $response.Content | ConvertFrom-Json
    if ($response.StatusCode -ne 202 -or $receipt.submission_id -ne $id -or $receipt.status -ne 'accepted') { throw 'Unexpected receipt' }
    [pscustomobject]@{ result = 'PASS'; transport = 'Windows loopback -> WSL2'; http_status = 202; submission_id = $id } | ConvertTo-Json -Compress
} catch {
    # Exception details could include request/configuration: keep the output fixed.
    Write-Output 'FAIL: local Windows signed probe; inspect loopback server and private test configuration without printing secrets.'
    exit 1
}
