#!/bin/zsh
set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"
PID_FILE=".runtime/dev.pid"

if [[ -f .runtime/docker-mode ]] && command -v docker >/dev/null 2>&1; then
  docker compose down
  rm -f .runtime/docker-mode
fi

if [[ -f "$PID_FILE" ]]; then
  SERVER_PID="$(<"$PID_FILE")"
  if [[ "$SERVER_PID" == <-> ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID"
  fi
  rm -f "$PID_FILE"
fi
