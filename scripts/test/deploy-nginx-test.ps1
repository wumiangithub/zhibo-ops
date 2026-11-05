$ErrorActionPreference = "Stop"
$OpsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ZhiboRoot = Split-Path $OpsRoot -Parent
if (-not (Test-Path (Join-Path $ZhiboRoot "zhibo-frontend"))) { $ZhiboRoot = "D:\ai-project\zhibo"; $OpsRoot = Join-Path $ZhiboRoot "zhibo-ops" }
$HostName = "ubuntu@14.103.210.83"
$NginxDir = Join-Path $OpsRoot "nginx\test"

Write-Host "== Upload + reload Nginx (test, HTTP+HTTPS by domain) ==" -ForegroundColor Cyan
scp (Join-Path $NginxDir "ssl-wildcard-caijisong.conf") ("{0}:~/ssl-wildcard-caijisong.conf" -f $HostName)
$pairs = @(
  @{ Local = "admin-web.conf"; Remote = "zhibo-admin-web.conf" },
  @{ Local = "live-web.conf"; Remote = "zhibo-live-web.conf" },
  @{ Local = "admin-server.conf"; Remote = "zhibo-admin-server.conf" },
  @{ Local = "client-server.conf"; Remote = "zhibo-client-server.conf" }
)
foreach ($p in $pairs) {
  scp (Join-Path $NginxDir $p.Local) ("{0}:~/{1}" -f $HostName, $p.Local)
}

$cmd = "set -e; "
$cmd += "sudo mkdir -p /etc/nginx/snippets; "
$cmd += "sudo cp ~/ssl-wildcard-caijisong.conf /etc/nginx/snippets/ssl-wildcard-caijisong.conf; "
foreach ($p in $pairs) {
  $cmd += "sudo cp ~/$($p.Local) /etc/nginx/sites-available/$($p.Remote); "
  $cmd += "sudo ln -sfn /etc/nginx/sites-available/$($p.Remote) /etc/nginx/sites-enabled/$($p.Remote); "
}
# drop obsolete wxapi site (wildcard SSL moved into snippets + per-domain servers)
$cmd += "sudo rm -f /etc/nginx/sites-enabled/qkzhlive-wxapi-test.conf; "
$cmd += "sudo nginx -t && sudo systemctl reload nginx; ss -lntp | grep -E ':80|:443' || true"
ssh -t $HostName $cmd
Write-Host "== Nginx done ==" -ForegroundColor Green
Write-Host "https://qkzb-admin-test.caijisong.com.cn"
Write-Host "https://qkzb-live-test.caijisong.com.cn"
