#!/bin/sh
set -e
PW_FILE=/run/secrets/zhibo-mysql.password
if [ ! -f "$PW_FILE" ]; then
  echo "missing mysql password file"
  exit 1
fi
MYSQL_PASSWORD=$(cat "$PW_FILE")
export MYSQL_PASSWORD
HOST="${MYSQL_HOST:-zhibo-mysql}"
PORT="${MYSQL_PORT:-3306}"
DB="${MYSQL_DATABASE:-zhibo}"
export SPRING_DATASOURCE_USERNAME="${MYSQL_USER:-zhibo}"
export SPRING_DATASOURCE_PASSWORD="$MYSQL_PASSWORD"
export SPRING_DATASOURCE_URL="jdbc:mysql://${HOST}:${PORT}/${DB}?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&sslMode=DISABLED"
exec "$@"
