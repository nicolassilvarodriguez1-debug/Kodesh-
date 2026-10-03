#!/bin/sh
# Prueba las migraciones de racha/maná en un Postgres local desechable.
# Uso: sh tests/sql/run.sh   (requiere postgres; en Ubuntu: apt install postgresql)
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
TMP=$(mktemp -d)
chown postgres "$TMP" 2>/dev/null || true
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else sh -c "$*"; fi; }
run "$PGBIN/initdb -D $TMP/data -A trust -U postgres >/dev/null"
run "$PGBIN/pg_ctl -D $TMP/data -o '-k $TMP -p 55432 -c listen_addresses=' -l $TMP/log start >/dev/null"
trap 'run "$PGBIN/pg_ctl -D $TMP/data stop -m immediate >/dev/null"; rm -rf "$TMP"' EXIT
P="psql -h $TMP -p 55432 -U postgres -q -v ON_ERROR_STOP=1"
$P -d postgres -c 'create database t' >/dev/null
$P -d t -f "$DIR/stub_supabase.sql" >/dev/null
$P -d t -f "$DIR/../../supabase/migrations/20261002_racha_mana.sql" >/dev/null
$P -d t -t -f "$DIR/racha_test.sql" | grep -v "^\s*$"
