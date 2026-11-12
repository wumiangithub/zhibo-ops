param(
  [ValidateSet("local", "host")]
  [string]$Source = "local",
  [string]$DumpFile = ""
)

$ErrorActionPreference = "Stop"
$OpsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ZhiboRoot = Split-Path $OpsRoot -Parent
if (-not (Test-Path (Join-Path $ZhiboRoot "zhibo-backend"))) {
  $ZhiboRoot = "D:\ai-project\zhibo"
  $OpsRoot = Join-Path $ZhiboRoot "zhibo-ops"
}
$HostName = "ubuntu@14.103.210.83"
$ImportRemote = "/home/ubuntu/zhibo/docker/import-zhibo-mysql.sh"

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

function Find-MysqlDump {
  $cmd = Get-Command mysqldump -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $roots = @(
    "C:\Program Files\MySQL",
    "C:\Program Files (x86)\MySQL",
    "C:\Program Files\MariaDB *"
  )
  $hits = Get-ChildItem -Path $roots -Filter mysqldump.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hits) { return $hits.FullName }
  return $null
}

if ($Source -eq "host") {
  Write-Host "== Import host zhibo database into container MySQL ==" -ForegroundColor Cyan
  ssh -o BatchMode=yes $HostName "bash $ImportRemote --from-host"
  if ($LASTEXITCODE -ne 0) { throw "Remote import from host MySQL failed" }
  Write-Host "== Import finished (source=host) ==" -ForegroundColor Green
  return
}

$envRoot = Join-Path $ZhiboRoot "zhibo-backend"
$map = Read-EnvMap @(
  (Join-Path $envRoot ".env"),
  (Join-Path $envRoot ".env.local")
)
$dbHost = if ($map.Contains("MYSQL_HOST") -and $map["MYSQL_HOST"]) { $map["MYSQL_HOST"] } else { "127.0.0.1" }
$dbPort = if ($map.Contains("MYSQL_PORT") -and $map["MYSQL_PORT"]) { $map["MYSQL_PORT"] } else { "3306" }
$dbName = if ($map.Contains("MYSQL_DATABASE") -and $map["MYSQL_DATABASE"]) { $map["MYSQL_DATABASE"] } else { "zhibo" }
$dbUser = if ($map.Contains("MYSQL_USER") -and $map["MYSQL_USER"]) { $map["MYSQL_USER"] } else { "root" }
if (-not $map.Contains("MYSQL_PASSWORD") -or -not $map["MYSQL_PASSWORD"]) {
  throw "MYSQL_PASSWORD not found in zhibo-backend .env / .env.local"
}

$localDump = $DumpFile
$tmpDir = $null
if (-not $localDump) {
  $dumpExe = Find-MysqlDump
  if (-not $dumpExe) { throw "mysqldump not found on this machine" }
  $tmpDir = Join-Path $env:TEMP ("zhibo-mysql-import-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  $localDump = Join-Path $tmpDir "zhibo-local.sql"
  $cnf = Join-Path $tmpDir "client.cnf"
  $pw = [string]$map["MYSQL_PASSWORD"]
  if (($pw.StartsWith('"') -and $pw.EndsWith('"')) -or ($pw.StartsWith("'") -and $pw.EndsWith("'"))) {
    $pw = $pw.Substring(1, $pw.Length - 2)
  }
  $cnfLines = @(
    "[client]",
    ("user={0}" -f $dbUser),
    ("password={0}" -f $pw),
    ("host={0}" -f $dbHost),
    ("port={0}" -f $dbPort),
    "default-character-set=utf8mb4"
  )
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($cnf, $cnfLines, $utf8)
  Write-Host ("== Dump local database {0} ==" -f $dbName) -ForegroundColor Cyan
  $dumpArgs = @(
    "--defaults-file=$cnf",
    "--single-transaction",
    "--routines",
    "--events",
    "--default-character-set=utf8mb4",
    "--hex-blob",
    "--set-gtid-purged=OFF",
    $dbName
  )
  $p = Start-Process -FilePath $dumpExe -ArgumentList $dumpArgs -RedirectStandardOutput $localDump -RedirectStandardError (Join-Path $tmpDir "dump.err") -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -ne 0) {
    $err = Get-Content -Path (Join-Path $tmpDir "dump.err") -Raw -ErrorAction SilentlyContinue
    throw ("mysqldump failed: {0}" -f $err)
  }
}
if (-not (Test-Path $localDump)) { throw "Dump file missing" }
$size = (Get-Item $localDump).Length
if ($size -lt 100) { throw "Dump file looks empty" }
Write-Host ("== Upload dump ({0} bytes) and import into container ==" -f $size) -ForegroundColor Cyan

$remoteName = "zhibo-local-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".sql"
$remotePath = "/home/ubuntu/zhibo/mysql/dumps/$remoteName"
try {
  ssh -o BatchMode=yes $HostName "mkdir -p /home/ubuntu/zhibo/mysql/dumps"
  scp -o BatchMode=yes $localDump ("{0}:{1}" -f $HostName, $remotePath)
  ssh -o BatchMode=yes $HostName ("bash {0} {1}" -f $ImportRemote, $remotePath)
  if ($LASTEXITCODE -ne 0) { throw "Remote import failed" }
} finally {
  if ($tmpDir) { Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue }
}
Write-Host "== Import finished (source=local) ==" -ForegroundColor Green
