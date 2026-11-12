#!/bin/bash
set -euo pipefail

CONTAINER_ENV=/home/ubuntu/.secrets/zhibo-mysql-container.env
HOST_CNF=/home/ubuntu/.secrets/zhibo-mysql.cnf
DUMP_DIR=/home/ubuntu/zhibo/mysql/dumps
COMPOSE=/home/ubuntu/zhibo/docker/compose.yml
mkdir -p "$DUMP_DIR"

if [ ! -f "$CONTAINER_ENV" ]; then
  echo "missing container mysql env; start the stack once first"
  exit 1
fi

FROM_HOST=0
DUMP_FILE=""
if [ "${1:-}" = "--from-host" ]; then
  FROM_HOST=1
  shift || true
fi
if [ -n "${1:-}" ]; then
  DUMP_FILE="$1"
fi

cd /home/ubuntu/zhibo/docker
docker compose -f "$COMPOSE" up -d zhibo-mysql
for i in $(seq 1 60); do
  status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' zhibo-mysql 2>/dev/null || echo missing)
  if [ "$status" = "healthy" ]; then
    break
  fi
  sleep 2
done
if [ "$status" != "healthy" ]; then
  echo "MYSQL_NOT_HEALTHY"
  docker logs --tail 80 zhibo-mysql || true
  exit 1
fi

if [ "$FROM_HOST" = "1" ]; then
  DUMP_FILE="$DUMP_DIR/zhibo-host-$(date +%Y%m%d-%H%M%S).sql"
  python3 - "$HOST_CNF" "$DUMP_FILE" << 'PY'
import configparser, pathlib, subprocess, sys, tempfile, os

cnf_path = pathlib.Path(sys.argv[1])
dump_path = pathlib.Path(sys.argv[2])
if not cnf_path.is_file():
    raise SystemExit("missing host mysql cnf")

cp = configparser.ConfigParser(interpolation=None)
if not cp.read(cnf_path):
    raise SystemExit("unable to read host mysql cnf")
user = cp.get("client", "user", fallback="zhibo")
password = cp.get("client", "password")
host = cp.get("client", "host", fallback="127.0.0.1")
port = cp.get("client", "port", fallback="3306")
database = cp.get("client", "database", fallback="zhibo")

tcp = configparser.ConfigParser(interpolation=None)
tcp["client"] = {"user": user, "password": password, "host": host, "port": str(port), "default-character-set": "utf8mb4"}
tmp = pathlib.Path(tempfile.mkstemp(prefix="zhibo-host-dump-", suffix=".cnf")[1])
try:
    with tmp.open("w", encoding="utf-8") as f:
        tcp.write(f)
    tmp.chmod(0o600)
    cmd = [
        "mysqldump", f"--defaults-file={tmp}",
        "--single-transaction", "--routines", "--events",
        "--default-character-set=utf8mb4", "--hex-blob",
        "--set-gtid-purged=OFF", database,
    ]
    with dump_path.open("wb") as out:
        r = subprocess.run(cmd, stdout=out, stderr=subprocess.PIPE)
    if r.returncode != 0:
        err = (r.stderr or b"").decode("utf-8", "replace")
        dump_path.unlink(missing_ok=True)
        raise SystemExit(err or "mysqldump failed")
finally:
    tmp.unlink(missing_ok=True)
print(f"DUMP_OK bytes={dump_path.stat().st_size}")
PY
fi

if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "usage: import-zhibo-mysql.sh --from-host | import-zhibo-mysql.sh /path/to/dump.sql"
  exit 1
fi

# Strip DEFINER so import does not require the host's zhibo@localhost account.
CLEAN_FILE="$DUMP_DIR/zhibo-import-clean.sql"
python3 - "$DUMP_FILE" "$CLEAN_FILE" << 'PY'
import pathlib, re, sys
src = pathlib.Path(sys.argv[1])
dst = pathlib.Path(sys.argv[2])
text = src.read_bytes()
text = re.sub(br"/\*!50017 DEFINER=`[^`]+`@`[^`]+`\s*\*/", b"", text)
text = re.sub(br"DEFINER=`[^`]+`@`[^`]+`\s*", b"", text)
dst.write_bytes(text)
print(f"CLEAN_OK bytes={dst.stat().st_size}")
PY

ROOT_CNF=$(python3 - "$CONTAINER_ENV" << 'PY'
import pathlib, sys, tempfile, configparser
env = {}
for raw in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    env[k.strip()] = v
cnf = configparser.ConfigParser(interpolation=None)
cnf["client"] = {
    "user": "root",
    "password": env["MYSQL_ROOT_PASSWORD"],
    "host": "127.0.0.1",
    "port": "3307",
    "default-character-set": "utf8mb4",
}
path = pathlib.Path(tempfile.mkstemp(prefix="zhibo-ctr-root-", suffix=".cnf")[1])
with path.open("w", encoding="utf-8") as f:
    cnf.write(f)
path.chmod(0o600)
print(path)
PY
)
cleanup() { rm -f "$ROOT_CNF" "$CLEAN_FILE"; }
trap cleanup EXIT

# Recreate the app schema but keep the container account (zhibo@%).
mysql --defaults-file="$ROOT_CNF" -e "DROP DATABASE IF EXISTS zhibo; CREATE DATABASE zhibo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON zhibo.* TO 'zhibo'@'%'; FLUSH PRIVILEGES;"
mysql --defaults-file="$ROOT_CNF" zhibo < "$CLEAN_FILE"
TABLES=$(mysql --defaults-file="$ROOT_CNF" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='zhibo';")
echo "IMPORT_OK tables=${TABLES}"
