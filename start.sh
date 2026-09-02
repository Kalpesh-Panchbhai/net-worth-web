#!/usr/bin/env bash
# ============================================================================
# Start the net-worth-web dev server (Vite).
# Proxies /api -> http://localhost:8080 (run the backend first).
# Usage: ./start.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "node_modules not found — installing dependencies..."
  npm install
fi

echo "Starting net-worth-web dev server..."
exec npm run dev
