param(
  [ValidateSet("all", "admin", "live")]
  [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$OpsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ZhiboRoot = Split-Path $OpsRoot -Parent
if (-not (Test-Path (Join-Path $ZhiboRoot "zhibo-backend"))) {
  $ZhiboRoot = "D:\ai-project\zhibo"
  $OpsRoot = Join-Path $ZhiboRoot "zhibo-ops"
}
$HostName = "ubuntu@14.103.210.83"
$JavaHome = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$BackendDir = Join-Path $ZhiboRoot "zhibo-backend\backend"
$AdminJar = Join-Path $BackendDir "admin-service\target\admin-service-1.0.0.jar"
$LiveJar = Join-Path $BackendDir "live-service\target\live-service-1.0.0.jar"
$ComposeLocal = Join-Path $OpsRoot "docker\test\compose.yml"
$StartLocal = Join-Path $OpsRoot "docker\test\start-zhibo-java.sh"
$EntryLocal = Join-Path $OpsRoot "docker\test\entrypoint.sh"
$ImportLocal = Join-Path $OpsRoot "docker\test\import-zhibo-mysql.sh"
$WantAdmin = ($Target -eq "all" -or $Target -eq "admin")
$WantLive = ($Target -eq "all" -or $Target -eq "live")

Write-Host ("== Build jars (JDK 17, target={0}) ==" -f $Target) -ForegroundColor Cyan
$env:JAVA_HOME = $JavaHome
$env:Path = "$JavaHome\bin;" + $env:Path

# Windows: local java -jar holds a lock on target/*.jar; spring-boot:repackage then fails to rename to .jar.original
$jarLockPatterns = @()
if ($WantAdmin) { $jarLockPatterns += "admin-service-1\.0\.0\.jar" }
if ($WantLive) { $jarLockPatterns += "live-service-1\.0\.0\.jar" }
$jarLockRegex = ($jarLockPatterns -join "|")
Get-CimInstance Win32_Process -Filter "Name='java.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and ($_.CommandLine -match $jarLockRegex) } |
  ForEach-Object {
    Write-Host ("Stopping local process locking jar: PID={0}" -f $_.ProcessId) -ForegroundColor Yellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Seconds 1

$modules = @()
if ($WantAdmin) { $modules += "admin-service" }
if ($WantLive) { $modules += "live-service" }
Push-Location $BackendDir
try {
  $pl = $modules -join ","
  & ".\mvnw.cmd" -pl $pl -am package -DskipTests
  if ($LASTEXITCODE -ne 0) { throw "Maven package failed" }
} finally {
  Pop-Location
}
if ($WantAdmin -and -not (Test-Path $AdminJar)) { throw "Missing admin jar" }
if ($WantLive -and -not (Test-Path $LiveJar)) { throw "Missing live jar" }
if (-not (Test-Path $ComposeLocal) -or -not (Test-Path $StartLocal) -or -not (Test-Path $EntryLocal) -or -not (Test-Path $ImportLocal)) { throw "Missing compose/start/entrypoint/import script" }

function Read-EnvMap([string[]]$paths) {
  $map = [ordered]@{}
  foreach ($p in $paths) {
    if (-not (Test-Path $p)) { continue }
    Get-Content -Path $p -Encoding UTF8 | ForEach-Object {
      $line = $_.Trim()
      if ($line -eq "" -or $line.StartsWith("#")) { return }
      $i = $line.IndexOf("=")
      if ($i -lt 1) { return }
      $map[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1)
    }
  }
  return $map
}

Write-Host "== Prepare env (password filled on server) ==" -ForegroundColor Cyan
$envRoot = Join-Path $ZhiboRoot "zhibo-backend"
$map = Read-EnvMap @(
  (Join-Path $envRoot ".env"),
  (Join-Path $envRoot ".env.local")
)
$map["MYSQL_HOST"] = "zhibo-mysql"
$map["MYSQL_PORT"] = "3306"
$map["MYSQL_DATABASE"] = "zhibo"
$map["MYSQL_USER"] = "zhibo"
$map["ADMIN_SERVER_PORT"] = "9080"
$map["LIVE_SERVER_PORT"] = "9081"
$map["SERVER_ADDRESS"] = "0.0.0.0"
if ($map.Contains("MYSQL_PASSWORD")) { $map.Remove("MYSQL_PASSWORD") }

$tmpDir = Join-Path $env:TEMP "zhibo-java-deploy"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$tmpEnv = Join-Path $tmpDir "zhibo-java.env"
$lines = New-Object System.Collections.Generic.List[string]
foreach ($k in $map.Keys) {
  $lines.Add(("{0}={1}" -f $k, $map[$k]))
}
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($tmpEnv, $lines, $utf8)

try {
  Write-Host "== Upload jars, compose, env ==" -ForegroundColor Cyan
  ssh -o BatchMode=yes $HostName "mkdir -p /home/ubuntu/zhibo/jars /home/ubuntu/zhibo/docker /home/ubuntu/.secrets && chmod 700 /home/ubuntu/.secrets"
  $jars = @()
  if ($WantAdmin) { $jars += $AdminJar }
  if ($WantLive) { $jars += $LiveJar }
  foreach ($jarPath in $jars) {
    $jarItem = Get-Item $jarPath
    Write-Host ("Uploading {0} ({1:N1} MB) ..." -f $jarItem.Name, ($jarItem.Length / 1MB))
    scp -o BatchMode=yes $jarItem.FullName ("{0}:/home/ubuntu/zhibo/jars/" -f $HostName)
    if ($LASTEXITCODE -ne 0) { throw "scp failed: $($jarItem.Name)" }
    Write-Host ("Uploaded {0}" -f $jarItem.Name)
  }
  Write-Host "Uploading compose, start scripts, and env ..."
  scp -o BatchMode=yes $ComposeLocal ("{0}:/home/ubuntu/zhibo/docker/compose.yml" -f $HostName)
  scp -o BatchMode=yes $StartLocal ("{0}:/home/ubuntu/zhibo/docker/start-zhibo-java.sh" -f $HostName)
  scp -o BatchMode=yes $EntryLocal ("{0}:/home/ubuntu/zhibo/docker/entrypoint.sh" -f $HostName)
  scp -o BatchMode=yes $ImportLocal ("{0}:/home/ubuntu/zhibo/docker/import-zhibo-mysql.sh" -f $HostName)
  scp -o BatchMode=yes $tmpEnv ("{0}:/home/ubuntu/.secrets/zhibo-java.env" -f $HostName)
  ssh -o BatchMode=yes $HostName "chmod 600 /home/ubuntu/.secrets/zhibo-java.env && chmod 755 /home/ubuntu/zhibo/docker/start-zhibo-java.sh /home/ubuntu/zhibo/docker/entrypoint.sh /home/ubuntu/zhibo/docker/import-zhibo-mysql.sh"

  Write-Host "== Start containers ==" -ForegroundColor Cyan
  ssh -o BatchMode=yes $HostName ("bash /home/ubuntu/zhibo/docker/start-zhibo-java.sh {0}" -f $Target)
} finally {
  Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}

Write-Host ("== Java deploy finished (target={0}) ==" -f $Target) -ForegroundColor Green
if ($WantAdmin) { Write-Host "Admin: 127.0.0.1:9080" }
if ($WantLive) { Write-Host "Live: 127.0.0.1:9081" }
