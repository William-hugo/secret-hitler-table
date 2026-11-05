@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org & pause & exit /b)
if not exist node_modules (echo Installing... & call npm install --omit=dev)
if not exist cloudflared.exe (
  echo Downloading Cloudflare tunnel tool - one time only...
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
node server.js --online
pause
