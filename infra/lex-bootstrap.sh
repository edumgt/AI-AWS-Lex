#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SCRIPT="${ROOT_DIR}/infra/lex-bootstrap.py"

command -v "${PYTHON_BIN}" >/dev/null 2>&1 || {
  echo "python3가 필요합니다." >&2
  exit 1
}

exec "${PYTHON_BIN}" "${SCRIPT}" "$@"
