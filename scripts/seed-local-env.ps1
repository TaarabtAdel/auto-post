param(
  [Parameter(Mandatory = $true)]
  [string]$EnvPath
)

function New-HexSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}

if (-not (Test-Path -LiteralPath $EnvPath)) {
  Write-Error "Khong tim thay $EnvPath"
  exit 1
}

$content = Get-Content -LiteralPath $EnvPath -Raw -Encoding UTF8
$secret = New-HexSecret
$key = New-HexSecret

$content = $content -replace '(?m)^BETTER_AUTH_SECRET=.*$', "BETTER_AUTH_SECRET=$secret"
$content = $content -replace '(?m)^ENCRYPTION_KEY=.*$', "ENCRYPTION_KEY=$key"
$content = $content -replace '(?m)^BETTER_AUTH_URL=.*$', 'BETTER_AUTH_URL=http://localhost:3000'
$content = $content -replace '(?m)^NODE_ENV=.*$', 'NODE_ENV=development'
$content = $content -replace '(?m)^PORT=.*$', 'PORT=3000'
$content = $content -replace '(?m)^YOUTUBE_DL_SKIP_DOWNLOAD=.*(\r?\n)?', ''

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($EnvPath, $content.TrimEnd() + "`n", $utf8NoBom)

Write-Host "[seed-local-env] Da dien BETTER_AUTH_SECRET, ENCRYPTION_KEY, localhost:3000"
