#!/bin/sh
set -e

mkdir -p uploads

if [ -f node_modules/ffmpeg-static/ffmpeg ]; then
  chmod +x node_modules/ffmpeg-static/ffmpeg 2>/dev/null || true
fi

npx drizzle-kit push

exec "$@"
