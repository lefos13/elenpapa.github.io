#!/usr/bin/env bash
# Why this exists:
# macOS double-click launcher that starts the backoffice server (if needed)
# and opens the editor in the default browser without terminal commands.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

URL="http://127.0.0.1:4310"
LOG_FILE="$ROOT_DIR/.backoffice-launch.log"

is_running() {
  lsof -iTCP:4310 -sTCP:LISTEN >/dev/null 2>&1
}

if ! command -v npm >/dev/null 2>&1; then
  osascript -e 'display alert "Backoffice launcher error" message "npm was not found. Install Node.js first." as critical'
  exit 1
fi

if is_running; then
  open "$URL"
  exit 0
fi

nohup npm run backoffice >>"$LOG_FILE" 2>&1 &

for _ in {1..30}; do
  if is_running; then
    open "$URL"
    exit 0
  fi
  sleep 1
done

# Open anyway to surface any startup error directly in browser.
open "$URL"
