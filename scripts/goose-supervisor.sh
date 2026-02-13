#!/usr/bin/env bash
# goose-supervisor.sh — Process supervisor for goosed with auto-restart
#
# Usage:
#   ./scripts/goose-supervisor.sh [OPTIONS]
#
# Options:
#   --port PORT          Server port (default: 3284)
#   --auto-rebuild       Run cargo build before restart on crash
#   --max-restarts N     Maximum restart attempts (default: 20)
#   --log FILE           Log to file in addition to stdout
#   --binary PATH        Path to goosed binary (auto-detected if omitted)
#   --health-url URL     Health check URL (default: http://localhost:PORT/api/version)
#
# Exit codes from goosed:
#   0   = clean shutdown (don't restart)
#   42  = OTA restart requested (restart immediately)
#   *   = crash (restart with backoff)

set -euo pipefail

# --- Defaults ----------------------------------------------------------------
PORT=3284
AUTO_REBUILD=false
MAX_RESTARTS=20
LOG_FILE=""
BINARY=""
HEALTH_URL=""

# --- Parse args --------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)        PORT="$2"; shift 2 ;;
    --auto-rebuild) AUTO_REBUILD=true; shift ;;
    --max-restarts) MAX_RESTARTS="$2"; shift 2 ;;
    --log)         LOG_FILE="$2"; shift 2 ;;
    --binary)      BINARY="$2"; shift 2 ;;
    --health-url)  HEALTH_URL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

HEALTH_URL="${HEALTH_URL:-http://localhost:${PORT}/api/version}"

# --- Logging -----------------------------------------------------------------
log() {
  local msg
  msg="[$(date '+%Y-%m-%d %H:%M:%S')] [supervisor] $*"
  echo "$msg"
  [[ -n "$LOG_FILE" ]] && echo "$msg" >> "$LOG_FILE"
}

# --- Find binary -------------------------------------------------------------
find_binary() {
  if [[ -n "$BINARY" ]]; then
    echo "$BINARY"
    return
  fi
  local candidates=(
    "$(command -v goosed 2>/dev/null || true)"
    "./target/release/goosed"
    "./ui/desktop/bin/goosed"
    "/usr/local/bin/goosed"
  )
  for path in "${candidates[@]}"; do
    [[ -n "$path" && -x "$path" ]] && { echo "$path"; return; }
  done
  log "ERROR: goosed binary not found"
  exit 1
}

GOOSED_BIN="$(find_binary)"
log "Binary: $GOOSED_BIN"
log "Port: $PORT | Max restarts: $MAX_RESTARTS | Auto-rebuild: $AUTO_REBUILD"

# --- State -------------------------------------------------------------------
RESTART_COUNT=0
GOOSED_PID=0
STABILITY_WINDOW=600  # 10 minutes — reset counter after this
BACKOFF_BASE=1
BACKOFF_CAP=60

# --- Signal handling ---------------------------------------------------------
cleanup() {
  log "Supervisor shutting down..."
  if [[ $GOOSED_PID -gt 0 ]]; then
    kill "$GOOSED_PID" 2>/dev/null || true
    wait "$GOOSED_PID" 2>/dev/null || true
  fi
  log "Supervisor exited"
  exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

# --- Health check ------------------------------------------------------------
health_check() {
  local max_attempts=30
  for i in $(seq 1 "$max_attempts"); do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
      log "Health check passed (attempt $i/$max_attempts)"
      return 0
    fi
    sleep 1
  done
  log "WARNING: Health check failed after ${max_attempts}s"
  return 1
}

# --- Force restart (kill -9) -------------------------------------------------
force_kill() {
  if [[ $GOOSED_PID -gt 0 ]]; then
    log "Force killing goosed (PID $GOOSED_PID)"
    kill -9 "$GOOSED_PID" 2>/dev/null || true
    wait "$GOOSED_PID" 2>/dev/null || true
  fi
}

# --- Auto rebuild ------------------------------------------------------------
rebuild() {
  if [[ "$AUTO_REBUILD" == "true" ]]; then
    log "Auto-rebuilding goosed..."
    if cargo build --release -p goose-server 2>&1 | tail -3; then
      log "Rebuild succeeded"
      # Update binary path if using target/release
      if [[ "$GOOSED_BIN" == *"target/release"* ]]; then
        GOOSED_BIN="$(find_binary)"
      fi
    else
      log "WARNING: Rebuild failed, using existing binary"
    fi
  fi
}

# --- Main loop ---------------------------------------------------------------
log "Starting supervisor loop"

while true; do
  if [[ $RESTART_COUNT -ge $MAX_RESTARTS ]]; then
    log "ERROR: Max restarts ($MAX_RESTARTS) reached. Exiting."
    exit 1
  fi

  # Start goosed
  export GOOSE_PORT="$PORT"
  log "Starting goosed (attempt $((RESTART_COUNT + 1))/$MAX_RESTARTS)..."
  START_TIME=$(date +%s)

  "$GOOSED_BIN" agent &
  GOOSED_PID=$!
  log "goosed started (PID: $GOOSED_PID)"

  # Health check
  health_check || log "Continuing despite health check failure"

  # Wait for process to exit
  set +e
  wait "$GOOSED_PID"
  EXIT_CODE=$?
  set -e
  GOOSED_PID=0

  UPTIME=$(( $(date +%s) - START_TIME ))
  log "goosed exited with code $EXIT_CODE after ${UPTIME}s"

  # Reset counter if process was stable
  if [[ $UPTIME -gt $STABILITY_WINDOW ]]; then
    log "Process was stable for ${UPTIME}s, resetting restart counter"
    RESTART_COUNT=0
  fi

  # Decide restart strategy
  case $EXIT_CODE in
    0)
      log "Clean shutdown (exit 0). Not restarting."
      exit 0
      ;;
    42)
      log "OTA restart requested (exit 42). Restarting in 1s..."
      RESTART_COUNT=$((RESTART_COUNT + 1))
      sleep 1
      ;;
    *)
      RESTART_COUNT=$((RESTART_COUNT + 1))
      DELAY=$(( BACKOFF_BASE * (2 ** (RESTART_COUNT - 1)) ))
      [[ $DELAY -gt $BACKOFF_CAP ]] && DELAY=$BACKOFF_CAP
      log "Crash (exit $EXIT_CODE). Restarting in ${DELAY}s (attempt $RESTART_COUNT/$MAX_RESTARTS)..."
      rebuild
      sleep "$DELAY"
      ;;
  esac
done
