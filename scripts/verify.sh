#!/usr/bin/env bash
# Live agent-readiness checks against any site. The checks live in verify.py
# (standard library only); this wrapper keeps `bash scripts/verify.sh URL` and
# `npm run verify URL` working.
#   bash scripts/verify.sh https://your-domain [--json]
PY=$(command -v python3 || command -v python) || { echo "verify.sh needs python3"; exit 2; }
exec "$PY" "$(dirname "$0")/verify.py" "$@"
