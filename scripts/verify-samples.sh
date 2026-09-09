#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v pwsh >/dev/null || { echo 'Install PowerShell 7 (pwsh) to run the shared cross-platform verification.' >&2; exit 1; }
args=()
if [[ "${1:-}" == '--release-gate' ]]; then args+=('-ReleaseGate'); shift; fi
exec pwsh -NoProfile -File scripts/verify-samples.ps1 "${args[@]}" "$@"
