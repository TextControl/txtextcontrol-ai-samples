#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose stop
echo 'Containers stopped; data preserved. Press Ctrl+C in the start.sh terminal to stop the native AI service.'
