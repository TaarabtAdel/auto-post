#!/usr/bin/env bash
# Cài yt-dlp vào .venv (Python) — Node dùng qua YT_DLP_PATH hoặc .venv/bin/yt-dlp
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Thiếu python3. Cài Python 3.10+ rồi chạy lại."
  exit 1
fi

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -r requirements.txt

echo ""
echo "OK — yt-dlp $(yt-dlp --version)"
echo "App ưu tiên: $ROOT/.venv/bin/yt-dlp (hoặc đặt YT_DLP_PATH trong ecosystem.config.js)"
