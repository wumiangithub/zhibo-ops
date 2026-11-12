$ErrorActionPreference = "Stop"
$OpsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ZhiboRoot = Split-Path $OpsRoot -Parent
if (-not (Test-Path (Join-Path $ZhiboRoot "zhibo-frontend"))) { $ZhiboRoot = "D:\ai-project\zhibo"; $OpsRoot = Join-Path $ZhiboRoot "zhibo-ops" }
$HostName = "ubuntu@14.103.210.83"
$NginxDir = Join-Path $OpsRoot "nginx\test"
$utf8 = New-Object System.Text.UTF8Encoding $false

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

$remoteSh = @"
set -e
mkdir -p /etc/nginx/snippets
cp /home/ubuntu/ssl-wildcard-caijisong.conf /etc/nginx/snippets/ssl-wildcard-caijisong.conf
cp /home/ubuntu/admin-web.conf /etc/nginx/sites-available/zhibo-admin-web.conf
ln -sfn /etc/nginx/sites-available/zhibo-admin-web.conf /etc/nginx/sites-enabled/zhibo-admin-web.conf
cp /home/ubuntu/live-web.conf /etc/nginx/sites-available/zhibo-live-web.conf
ln -sfn /etc/nginx/sites-available/zhibo-live-web.conf /etc/nginx/sites-enabled/zhibo-live-web.conf
cp /home/ubuntu/admin-server.conf /etc/nginx/sites-available/zhibo-admin-server.conf
ln -sfn /etc/nginx/sites-available/zhibo-admin-server.conf /etc/nginx/sites-enabled/zhibo-admin-server.conf
cp /home/ubuntu/client-server.conf /etc/nginx/sites-available/zhibo-client-server.conf
ln -sfn /etc/nginx/sites-available/zhibo-client-server.conf /etc/nginx/sites-enabled/zhibo-client-server.conf
rm -f /etc/nginx/sites-enabled/qkzhlive-wxapi-test.conf
nginx -t
systemctl reload nginx
ss -lntp | grep -E ':80|:443' || true
"@
$tmpSh = Join-Path $env:TEMP "apply-zhibo-nginx.sh"
[System.IO.File]::WriteAllText($tmpSh, (($remoteSh -replace "`r`n", "`n").Trim() + "`n"), $utf8)
scp $tmpSh ("{0}:~/apply-zhibo-nginx.sh" -f $HostName)

$helper = Join-Path $env:TEMP "zhibo-nginx-sudo.ps1"
$helperBody = @"
`$ErrorActionPreference = 'Stop'
Write-Host 'Enter the test host sudo password when prompted, then wait for nginx -t / reload.'
ssh -t $HostName "sudo bash /home/ubuntu/apply-zhibo-nginx.sh"
exit `$LASTEXITCODE
"@
[System.IO.File]::WriteAllText($helper, $helperBody, $utf8)

Write-Host "A console window will open. Enter the test host sudo password there."
$p = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $helper) -Wait -PassThru -WindowStyle Normal
if ($null -eq $p -or $p.ExitCode -ne 0) {
  throw "Nginx remote sudo/reload failed (exit $($p.ExitCode))"
}

Write-Host "== Nginx done ==" -ForegroundColor Green
Write-Host "https://qkzb-admin-test.caijisong.com.cn"
Write-Host "https://qkzb-live-test.caijisong.com.cn"
