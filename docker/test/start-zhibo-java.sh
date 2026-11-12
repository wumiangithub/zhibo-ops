#!/bin/bash
set -euo pipefail

ENV_FILE=/home/ubuntu/.secrets/zhibo-java.env
COMPOSE=/home/ubuntu/zhibo/docker/compose.yml
SECRETS_DIR=/home/ubuntu/.secrets
CONTAINER_ENV="$SECRETS_DIR/zhibo-mysql-container.env"
CONTAINER_PW="$SECRETS_DIR/zhibo-container-mysql.password"

mkdir -p /home/ubuntu/zhibo/jars /home/ubuntu/zhibo/docker /home/ubuntu/zhibo/mysql/data /home/ubuntu/zhibo/mysql/dumps
chmod 700 "$SECRETS_DIR"

python3 - "$ENV_FILE" "$CONTAINER_ENV" "$CONTAINER_PW" << 'PY'
import pathlib, secrets, string, sys

env_path = pathlib.Path(sys.argv[1])
container_env = pathlib.Path(sys.argv[2])
container_pw = pathlib.Path(sys.argv[3])
if not env_path.is_file():
    raise SystemExit("missing java env file")

alphabet = string.ascii_letters + string.digits

def parse_env(path: pathlib.Path) -> dict:
    data = {}
    if not path.is_file():
        return data
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        data[key.strip()] = value
    return data

def write_env(path: pathlib.Path, data: dict, keys: list[str]) -> None:
    path.write_text("".join(f"{k}={data[k]}\n" for k in keys), encoding="utf-8")
    path.chmod(0o600)

cenv = parse_env(container_env)
need = [k for k in ("MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD") if not cenv.get(k)]
if need:
    cenv.setdefault("MYSQL_DATABASE", "zhibo")
    cenv.setdefault("MYSQL_USER", "zhibo")
    if not cenv.get("MYSQL_PASSWORD"):
        cenv["MYSQL_PASSWORD"] = "".join(secrets.choice(alphabet) for _ in range(32))
    if not cenv.get("MYSQL_ROOT_PASSWORD"):
        cenv["MYSQL_ROOT_PASSWORD"] = "".join(secrets.choice(alphabet) for _ in range(32))
    write_env(container_env, cenv, ["MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD"])
    print("SECRETS_CREATED")
else:
    print("SECRETS_OK")

container_pw.write_bytes(cenv["MYSQL_PASSWORD"].encode("utf-8"))
container_pw.chmod(0o600)

overrides = {
    "MYSQL_HOST": "zhibo-mysql",
    "MYSQL_PORT": "3306",
    "MYSQL_DATABASE": "zhibo",
    "MYSQL_USER": "zhibo",
    "ADMIN_SERVER_PORT": "9080",
    "LIVE_SERVER_PORT": "9081",
    "SERVER_ADDRESS": "0.0.0.0",
}

lines = []
seen = set()
for line in env_path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in line:
        lines.append(line)
        continue
    key, _, _ = line.partition("=")
    key = key.strip()
    if key == "MYSQL_PASSWORD":
        continue
    if key in overrides:
        lines.append(f"{key}={overrides[key]}")
        seen.add(key)
    else:
        lines.append(line)
for key, value in overrides.items():
    if key not in seen:
        lines.append(f"{key}={value}")
env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
env_path.chmod(0o600)
print("ENV_READY")
PY

wait_mysql() {
  local i status
  for i in $(seq 1 60); do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' zhibo-mysql 2>/dev/null || echo missing)
    if [ "$status" = "healthy" ]; then
      echo "MYSQL_HEALTHY"
      return 0
    fi
    sleep 2
  done
  echo "MYSQL_NOT_HEALTHY status=${status:-unknown}"
  docker logs --tail 80 zhibo-mysql || true
  return 1
}

wait_http() {
  local port="$1"
  local name="$2"
  local i code
  for i in $(seq 1 90); do
    code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 "http://127.0.0.1:${port}/" || true)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
      echo "${name}_HTTP=${code}"
      return 0
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo false)" != "true" ]; then
      echo "${name}_NOT_RUNNING"
      docker logs --tail 100 "$name" || true
      return 1
    fi
    sleep 2
  done
  echo "${name}_TIMEOUT"
  docker logs --tail 100 "$name" || true
  return 1
}

TARGET="${1:-all}"
case "$TARGET" in
  all|admin|live|mysql) ;;
  *) echo "unsupported target: $TARGET"; exit 1 ;;
esac

cd /home/ubuntu/zhibo/docker
docker compose -f "$COMPOSE" up -d zhibo-mysql
wait_mysql

if [ "$TARGET" = "all" ] || [ "$TARGET" = "admin" ]; then
  echo "Recreating zhibo-admin to load the new jar"; docker compose -f "$COMPOSE" up -d --force-recreate --no-deps zhibo-admin
  wait_http 9080 zhibo-admin
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "live" ]; then
  echo "Recreating zhibo-live to load the new jar"; docker compose -f "$COMPOSE" up -d --force-recreate --no-deps zhibo-live
  wait_http 9081 zhibo-live
fi

echo LISTEN
ss -lnt | grep -E ":(8080|8081|8082|8085|9080|9081|3306|3307|80|443) " || true
echo DOCKER
docker ps --filter name=zhibo- --format "{{.Names}} {{.Status}}"
echo PEER_JAVA
ps -eo cmd --no-headers | grep -E "[q]kzhihui-live-admin-api|[q]kzhihui-live-job|[x]xl-job-admin" || true
