#!/bin/bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Run on an Apple Silicon Mac, outside Rosetta.' >&2; exit 1; }
export PATH="/opt/homebrew/bin:$PATH:/usr/local/share/dotnet"
source ./require-dotnet.sh
require_dotnet
for tool in docker mkcert llama-server; do
  command -v "$tool" >/dev/null || { echo "Missing $tool. Install Docker Desktop and run: brew install mkcert llama.cpp" >&2; exit 1; }
done
docker info >/dev/null
docker compose version >/dev/null
[[ -f publish/ai-fdd/TXTextControl.AI.Service.dll ]] || { echo 'First create a package-based bundle using scripts/New-MacBookBundle.ps1.' >&2; exit 1; }
STATE_DIR="$HOME/Library/Application Support/TXTextControl AI"
case "$STATE_DIR" in *\"*|*\'*|*\\*|*\$*|*$'\n'*) echo 'Unsupported characters in the home directory path.' >&2; exit 1;; esac
mkdir -p "$STATE_DIR/tls" "$STATE_DIR/ai/App_Data/Knowledge" "$STATE_DIR/ai/artifacts" "$STATE_DIR/models" "$STATE_DIR/runtimes" "$STATE_DIR/mcp/documents" "$STATE_DIR/web/App_Data" "$STATE_DIR/web/artifacts"
chmod 700 "$STATE_DIR"
if [[ ! -f "$STATE_DIR/mcp/appsettings.json" ]]; then
  cp publish/mcp/appsettings.json "$STATE_DIR/mcp/appsettings.json"
fi
# This explicitly installs a local development CA in the Mac trust store.
# Its private CA key remains in mkcert's own directory and is NEVER copied.
mkcert -install
if [[ ! -f "$STATE_DIR/tls/server.pem" || ! -f "$STATE_DIR/tls/server.key" ]]; then
  mkcert -cert-file "$STATE_DIR/tls/server.pem" -key-file "$STATE_DIR/tls/server.key" localhost 127.0.0.1 ::1 host.docker.internal
fi
cp "$(mkcert -CAROOT)/rootCA.pem" "$STATE_DIR/tls/rootCA.pem"
if [[ ! -f "$STATE_DIR/ai.env" && ! -f "$STATE_DIR/web.env" && ! -f "$STATE_DIR/mcp.env" ]]; then
  ai_key="$(openssl rand -hex 32)"
  mcp_key="$(openssl rand -hex 32)"
  web_password="$(openssl rand -hex 24)"
  admin_password="$(openssl rand -hex 24)"
  printf 'ServiceAuthentication__ApiKey=%s\nLocalAI__McpCredentials__0__Endpoint=https://localhost:58506/mcp\nLocalAI__McpCredentials__0__Token=%s\n' "$ai_key" "$mcp_key" > "$STATE_DIR/ai.env"
  printf 'RemoteIntegration__ApiKey=%s\nDeploymentAuthentication__Password=%s\n' "$ai_key" "$web_password" > "$STATE_DIR/web.env"
  printf 'McpServiceAuthentication__ApiKey=%s\nAdmin__Username=admin\nAdmin__Password=%s\n' "$mcp_key" "$admin_password" > "$STATE_DIR/mcp.env"
  printf 'Web: https://localhost:8443\nUsername: admin\nPassword: %s\n\nMCP admin: https://localhost:58506/admin\nUsername: admin\nPassword: %s\n' "$web_password" "$admin_password" > "$STATE_DIR/login.txt"
elif [[ ! -f "$STATE_DIR/ai.env" || ! -f "$STATE_DIR/web.env" || ! -f "$STATE_DIR/mcp.env" ]]; then
  echo 'Incomplete credential files. Restore them from backup; setup will not rotate or overwrite existing secrets.' >&2; exit 1
fi
printf 'STATE_DIR=%s\nLOCAL_UID=%s\nLOCAL_GID=%s\n' "$STATE_DIR" "$(id -u)" "$(id -g)" > .env
chmod 600 .env "$STATE_DIR/"*.env "$STATE_DIR/tls/server.key" "$STATE_DIR/login.txt"
chmod +x setup.sh start.sh stop.sh
if [[ -f images.tar ]]; then docker load -i images.tar; else docker compose build; fi
printf '\nReady. Put your chat and optional embedding GGUF files in:\n%s/models\n' "$STATE_DIR"
printf 'Credentials: %s/login.txt\nStart: bash start.sh\n' "$STATE_DIR"
