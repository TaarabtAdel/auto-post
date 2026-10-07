#!/bin/sh
set -e

mkdir -p uploads

npx drizzle-kit push

exec "$@"
