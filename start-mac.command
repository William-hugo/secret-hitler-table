#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js is not installed. Get the LTS version from https://nodejs.org"; read -p "Press Enter to close"; exit 1; fi
[ -d node_modules ] || npm install --omit=dev
node server.js
