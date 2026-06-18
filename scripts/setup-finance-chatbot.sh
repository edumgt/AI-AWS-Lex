#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="${ROOT_DIR}/scripts/provision-finance-chatbot.sh"

RUN_LAMBDA_STEP="${RUN_LAMBDA_STEP:-false}" \
RUN_BOOTSTRAP_STEP=true \
RUN_TEST_STEP=false \
"${SCRIPT}" "$@"
