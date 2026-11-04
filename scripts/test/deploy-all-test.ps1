$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "== ALL: nginx then frontend ==" -ForegroundColor Cyan
& "$PSScriptRoot\deploy-nginx-test.ps1"
& "$PSScriptRoot\deploy-frontend-test.ps1"
Write-Host "== ALL done ==" -ForegroundColor Green
