#!/usr/bin/env bash
# Run a python script with whichever interpreter exists (stock Ubuntu has only python3).
PY=$(command -v python3 || command -v python) || { echo "needs python3"; exit 2; }
exec "$PY" "$@"
