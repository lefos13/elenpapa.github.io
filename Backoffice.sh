#!/usr/bin/env bash
# Why this exists:
# Linux launcher that starts the backoffice server (if needed) and opens
# the editor URL in the default browser via xdg-open/gio.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

URL="http://127.0.0.1:4310"
LOG_FILE="$ROOT_DIR/.backoffice-launch.log"

is_running() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn | grep -q ":4310 "
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:4310 -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  return 1
}

open_url() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
    return
  fi
  if command -v gio >/dev/null 2>&1; then
    gio open "$URL" >/dev/null 2>&1 &
    return
  fi
  echo "Backoffice URL: $URL"
}

if ! command -v npm >/dev/null 2>&1; then
  echo "[Backoffice] npm was not found. Install Node.js first."
  exit 1
fi

if is_running; then
  open_url
  exit 0
fi

nohup npm run backoffice >>"$LOG_FILE" 2>&1 &

for _ in $(seq 1 30); do
  if is_running; then
    open_url
    exit 0
  fi
  sleep 1
done

open_url
