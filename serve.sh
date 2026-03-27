#!/usr/bin/env bash
# Serves ExplainLikeAI over HTTP and opens your default browser.
# Usage: ./serve.sh [PORT]
# Default port: 8765

set -euo pipefail
PORT="${1:-8765}"
cd "$(dirname "$0")"

echo "Starting server at http://127.0.0.1:${PORT}/"
python3 -m http.server "$PORT" --bind 127.0.0.1 &
PID=$!
sleep 0.6

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:${PORT}/" || true
elif command -v sensible-browser >/dev/null 2>&1; then
  sensible-browser "http://127.0.0.1:${PORT}/" || true
else
  echo "Open this URL manually in your browser: http://127.0.0.1:${PORT}/"
fi

echo "Server PID ${PID}. Press Ctrl+C to stop."
wait "${PID}"
