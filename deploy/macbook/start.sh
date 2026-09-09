#!/bin/bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:$PATH:/usr/local/share/dotnet"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'An Apple Silicon Mac is required.' >&2; exit 1; }
source ./require-dotnet.sh
require_dotnet
assembly="$PWD/publish/ai-fdd/TXTextControl.AI.Service.dll"
[[ -f "$assembly" ]] || { echo 'Missing publish/ai-fdd. Create the complete bundle using scripts/New-MacBookBundle.ps1.' >&2; exit 1; }
STATE_DIR="$HOME/Library/Application Support/TXTextControl AI"
[[ -f .env && -f "$STATE_DIR/ai.env" ]] || { echo 'Run bash setup.sh first.' >&2; exit 1; }
command -v llama-server >/dev/null || { echo 'Install llama.cpp using Homebrew first.' >&2; exit 1; }
docker info >/dev/null
docker compose config --quiet
if lsof -n -iTCP:5081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo 'Port 5081 is already in use. Stop the existing AI service before starting another.' >&2; exit 1
fi
# Only setup-generated, private key/value assignments are sourced, never downloaded scripts.
set -a
source "$STATE_DIR/ai.env"
set +a
export ASPNETCORE_ENVIRONMENT=Production
export ASPNETCORE_URLS=https://0.0.0.0:5081
export Kestrel__Certificates__Default__Path="$STATE_DIR/tls/server.pem"
export Kestrel__Certificates__Default__KeyPath="$STATE_DIR/tls/server.key"
export LocalAI__LlamaServerExecutablePath="$(command -v llama-server)"
export LocalAI__ModelDirectory="$STATE_DIR/models"
export LocalAI__RuntimeCacheDirectory="$STATE_DIR/runtimes"
export LocalAI__RuntimeDownloadSettingsFile=App_Data/runtime-download.json
export LocalAI__ModelPath="${TX_CHAT_MODEL:-}"
export LocalAI__WarmupOnStartup=false
export LocalAI__AutoInstallRuntime=false
export LocalAI__McpEndpoint=https://localhost:58506/mcp
export LocalAI__TrustedMcpEndpoints__0=https://localhost:58506/mcp
export LocalAI__ContextSize="${TX_CONTEXT_SIZE:-32768}"
export LocalAI__GpuLayers=-1
export Knowledge__Enabled=true
ai_pid=''
cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$ai_pid" ]]; then kill -TERM "$ai_pid" 2>/dev/null || true; wait "$ai_pid" 2>/dev/null || true; fi
  docker compose stop >/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker compose up -d --no-build
(cd "$STATE_DIR/ai"; exec "$DOTNET_HOST" "$assembly" --contentRoot "$STATE_DIR/ai") &
ai_pid=$!
ready=false
for attempt in {1..30}; do
  kill -0 "$ai_pid" 2>/dev/null || { echo 'AI service exited during startup.' >&2; exit 1; }
  if curl --silent --fail --max-time 2 --cacert "$STATE_DIR/tls/rootCA.pem" https://localhost:5081/health >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'AI health check failed; inspect the startup output above.' >&2; exit 1; }
echo 'AI service ready. Opening https://localhost:8443 (web may need a few more seconds).'
echo "Log in using $STATE_DIR/login.txt. Keep this terminal open; Ctrl+C stops both parts."
open https://localhost:8443
wait "$ai_pid"
