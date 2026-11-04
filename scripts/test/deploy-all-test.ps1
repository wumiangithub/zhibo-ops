$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "== ALL: nginx then admin-web then live-web ==" -ForegroundColor Cyan
& "$PSScriptRoot\deploy-nginx-test.ps1"
& "$PSScriptRoot\deploy-admin-web-test.ps1"
& "$PSScriptRoot\deploy-live-web-test.ps1"
Write-Host "== ALL done ==" -ForegroundColor Green
