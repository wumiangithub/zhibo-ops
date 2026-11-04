$ErrorActionPreference = "Stop"
# scripts/test -> scripts -> zhibo-ops
$OpsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ZhiboRoot = Split-Path $OpsRoot -Parent
if (-not (Test-Path (Join-Path $ZhiboRoot "zhibo-frontend"))) { $ZhiboRoot = "D:\ai-project\zhibo"; $OpsRoot = Join-Path $ZhiboRoot "zhibo-ops" }
$HostName = "ubuntu@14.103.210.83"

Write-Host "== Upload + reload Nginx (test) ==" -ForegroundColor Cyan
scp (Join-Path $OpsRoot "nginx\test\admin-web.conf") "${HostName}:~/"
scp (Join-Path $OpsRoot "nginx\test\live-web.conf") "${HostName}:~/"
ssh -t $HostName "sudo cp ~/admin-web.conf /etc/nginx/sites-available/zhibo-admin-web.conf && sudo cp ~/live-web.conf /etc/nginx/sites-available/zhibo-live-web.conf && sudo nginx -t && sudo systemctl reload nginx && ss -lntp | grep -E '5173|5174|8080|8081' || true"
Write-Host "== Nginx done ==" -ForegroundColor Green
