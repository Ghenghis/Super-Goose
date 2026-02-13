#!/usr/bin/env bash
# Local validation for backend E2E tests.
# Usage: bash scripts/test-backend-e2e.sh
#
# Builds goosed, starts it, runs the backend-dependent Playwright tests,
# then cleans up.  Exit code reflects test result.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UI="$ROOT/ui/desktop"
BIN="$UI/bin/goosed"

echo "=== Building goosed (release) ==="
cargo build --release -p goose-server
mkdir -p "$UI/bin"
cp "$ROOT/target/release/goosed" "$BIN"
chmod +x "$BIN"

echo "=== Starting goosed ==="
"$BIN" &
GOOSED_PID=$!
sleep 8

# Health-check
if curl -sf http://localhost:3284/api/version > /dev/null 2>&1; then
  echo "goosed is up (PID $GOOSED_PID)"
else
  echo "WARNING: goosed health-check failed, continuing anyway..."
fi

echo "=== Running backend E2E tests ==="
cd "$UI"
GOOSE_BACKEND=1 npx playwright test tests/e2e/backend-*.spec.ts \
  --reporter=list \
  --max-failures=5 || TEST_EXIT=$?

echo "=== Cleanup ==="
kill "$GOOSED_PID" 2>/dev/null || true
wait "$GOOSED_PID" 2>/dev/null || true

exit "${TEST_EXIT:-0}"
