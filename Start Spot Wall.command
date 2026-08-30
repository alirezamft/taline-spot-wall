#!/bin/zsh
set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

mkdir -p .runtime

if curl --silent --fail --max-time 1 http://localhost:3000/ >/dev/null 2>&1; then
  open http://localhost:3000/
  exit 0
fi

USE_LOCAL_NODE=false
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if (( NODE_MAJOR >= 22 )); then
    USE_LOCAL_NODE=true
  fi
fi

if [[ "$USE_LOCAL_NODE" == true ]]; then
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  nohup npm run dev > .runtime/dev.log 2>&1 &
  echo $! > .runtime/dev.pid
  rm -f .runtime/docker-mode
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose up --build --detach > .runtime/dev.log 2>&1
  touch .runtime/docker-mode
else
  osascript -e 'display dialog "برای اجرا به Node.js نسخه ۲۲ یا Docker Desktop نیاز است." buttons {"باشه"} default button 1 with icon stop'
  exit 1
fi

for attempt in {1..180}; do
  if curl --silent --fail --max-time 1 http://localhost:3000/ >/dev/null 2>&1; then
    open http://localhost:3000/
    exit 0
  fi
  sleep 1
done

osascript -e 'display dialog "اجرای Spot Wall کامل نشد. فایل .runtime/dev.log را بررسی کنید." buttons {"باشه"} default button 1 with icon stop'
exit 1
