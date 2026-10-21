#!/usr/bin/env bash
# Serve the web port at http://localhost:8765
set -e
cd "$(dirname "$0")"
exec python3 tools/serve.py 8765
