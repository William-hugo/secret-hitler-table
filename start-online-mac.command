#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js is not installed. Get the LTS version from https://nodejs.org"; read -p "Press Enter to close"; exit 1; fi
[ -d node_modules ] || npm install --omit=dev
if ! command -v cloudflared >/dev/null && [ ! -x ./cloudflared ]; then
  echo "Downloading Cloudflare tunnel tool (one time only)..."
  ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && F=cloudflared-darwin-arm64.tgz || F=cloudflared-darwin-amd64.tgz
  curl -L -o cf.tgz https://github.com/cloudflare/cloudflared/releases/latest/download/$F && tar xzf cf.tgz && rm cf.tgz && chmod +x cloudflared
fi
node server.js --online
