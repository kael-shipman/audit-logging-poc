#!/bin/bash

set -e

export PATH="$(npm bin);$PATH"

if [ ! -d "node_modules" ]; then
  echo "Looks like we're not initialized. Running lerna boostrap --hoist"
  if ! command -v lerna &>/dev/null; then
    echo "Can't find lerna. Running npm install first."
    npm install
    echo "Ok, now running lerna"
  fi
  lerna bootstrap --hoist
fi

if [ ! -f ./packages/audit-types/dist/index.js ]; then
  (
    cd ./packages/audit-types
    npm run build
  )
fi


if [ ! -f ./packages/api/dist/index.js ]; then
  (
    cd ./packages/api
    npm run build
  )
fi

if [ ! -f ./packages/auditor/dist/index.js ]; then
  (
    cd ./packages/auditor
    npm run build
  )
fi

if [ ! -f ./packages/website/server.js ]; then
  (
    cd ./packages/website
    npm run build
  )
fi

d="$PWD"

cd "$d/packages/api"
nodejs ./dist/index.js &
api="$!"
cd "$d/packages/auditor"
nodejs ./dist/index.js &
auditor="$!"
cd "$d/packages/website"
nodejs ./server.js &
website="$!"

function cleanup() {
  if [ -n "$api" ]; then
    echo "Killing API"
    kill "$api"
  fi
  if [ -n "$auditor" ]; then
    echo "Killing auditor"
    kill "$auditor"
  fi
  if [ -n "$website" ]; then
    echo "Killing website"
    kill "$website"
  fi
}

trap cleanup SIGINT SIGTERM SIGKILL

while true; do
  sleep 30
done

