$ErrorActionPreference = "Stop"
$OpsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ZhiboRoot = Split-Path $OpsRoot -Parent
if (-not (Test-Path (Join-Path $ZhiboRoot "zhibo-frontend"))) { $ZhiboRoot = "D:\ai-project\zhibo"; $OpsRoot = Join-Path $ZhiboRoot "zhibo-ops" }
$Frontend = Join-Path $ZhiboRoot "zhibo-frontend"
$HostName = "ubuntu@14.103.210.83"

Write-Host "== Build + upload admin-web ==" -ForegroundColor Cyan
Push-Location (Join-Path $Frontend "admin-web")
npm run build:test
if ($LASTEXITCODE -ne 0) { throw "admin-web build failed" }
scp -r .\dist\* "${HostName}:/var/www/zhibo/admin-web/"
Pop-Location

Write-Host "== admin-web done ==" -ForegroundColor Green
Write-Host "http://14.103.210.83:5173"
