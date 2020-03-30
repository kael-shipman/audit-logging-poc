#!/bin/bash

set -e

SKIP_BUILD=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-build|-s) SKIP_BUILD=1; shift;;
    *) >&2 echo "E: Bad argument '$1'"; exit 1;;
  esac
done

export PATH="$(npm bin);$PATH"

if ! npx --no-install lerna -v &>/dev/null; then
  echo "Can't find lerna. Running npm install first."
  npm install
fi
echo "Bootstrapping packages"
npx lerna bootstrap --hoist

if [ "$SKIP_BUILD" -eq 0 ]; then
  # Types
  (
    cd ./packages/audit-types
    npm run build
  )
      
  # API
  (
    cd ./packages/api
    npm run build
  )

  # Auditor
  (
    cd ./packages/auditor
    npm run build
  )

  # Website
  (
    cd ./packages/website
    npm run build
  )
fi

d="$PWD"

cd "$d/packages/api/db"
if ! shmig up; then
  DB="$(grep 'DATABASE' shmig.conf | sed 's/^.*=//')"
  USER="$(grep 'LOGIN' shmig.conf | sed 's/^.*=//')"
  PW="$(grep 'PASSWORD' shmig.conf | sed 's/^.*=//')"
  >&2 echo "'shmig up' failed. Please run the following commands or"
  >&2 echo "your own variation of them and rerun this script:"
  >&2 echo
  >&2 echo "  echo 'CREATE DATABASE \`$DB\` DEFAULT CHARSET "'"'"utf8"'"'" DEFAULT COLLATE "'"'"utf8_general_ci"'"'";' | sudo HOME=/root mysql"
  >&2 echo "  echo 'GRANT ALL ON \`$DB\`.* TO "'"'"$USER"'"'"@"'"'"localhost"'"'" IDENTIFIED BY "'"'"$PW"'"'";' | sudo HOME=/root mysql"
  >&2 echo

  exit 1
fi

cd "$d/packages/auditor/db"
if ! shmig up; then
  DB="$(grep 'DATABASE' shmig.conf | sed 's/^.*=//')"
  USER="$(grep 'LOGIN' shmig.conf | sed 's/^.*=//')"
  PW="$(grep 'PASSWORD' shmig.conf | sed 's/^.*=//')"
  >&2 echo "'shmig up' failed. Please run the following command or"
  >&2 echo "your own variation of it and rerun this script:"
  >&2 echo
  >&2 echo "  echo 'CREATE DATABASE \`$DB\` DEFAULT CHARSET "'"'"utf8"'"'" DEFAULT COLLATE "'"'"utf8_general_ci"'"'";' | sudo HOME=/root mysql"
  >&2 echo "  echo 'GRANT ALL ON \`$DB\`.* TO "'"'"$USER"'"'"@"'"'"localhost"'"'" IDENTIFIED BY "'"'"$PW"'"'";' | sudo HOME=/root mysql"
  >&2 echo

  exit 1
fi

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
    kill "$api" 2>/dev/null || true
  fi
  if [ -n "$auditor" ]; then
    echo "Killing auditor"
    kill "$auditor" 2>/dev/null || true
  fi
  if [ -n "$website" ]; then
    echo "Killing website"
    kill "$website" 2>/dev/null || true
  fi
}

trap cleanup SIGINT SIGTERM SIGKILL

while true; do
  if
    ! ps -p $api >/dev/null || \
    ! ps -p $auditor >/dev/null || \
    ! ps -p $website >/dev/null
  then
    >&2 echo "One or more services died. Shutting down."
    cleanup
    exit 4
  fi

  sleep 2
done

