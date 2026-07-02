#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG_FILE="${ROOT_DIR}/infra/config.env"
[[ -f "${CFG_FILE}" ]] || CFG_FILE="${ROOT_DIR}/infra/config.example.env"

# shellcheck disable=SC1090
source "${CFG_FILE}"

AWS_BIN="${AWS_BIN:-aws}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
ZIP_BIN="${ZIP_BIN:-zip}"

LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-LexReservationFulfillment}"
LAMBDA_RUNTIME="${LAMBDA_RUNTIME:-nodejs20.x}"
LAMBDA_HANDLER="${LAMBDA_HANDLER:-index.handler}"
LAMBDA_EXEC_ROLE_ARN="${LAMBDA_EXEC_ROLE_ARN:-${LAMBDA_ROLE_ARN:-}}"
TESTCASE_FILE="${TESTCASE_FILE:-${ROOT_DIR}/scripts/seed-testcases.json}"
OUTPUT_ENV_FILE="${OUTPUT_ENV_FILE:-${ROOT_DIR}/scripts/.last-finance-chatbot.env}"

RUN_LAMBDA_STEP="${RUN_LAMBDA_STEP:-true}"
RUN_BOOTSTRAP_STEP="${RUN_BOOTSTRAP_STEP:-true}"
RUN_TEST_STEP="${RUN_TEST_STEP:-true}"

for bin in "${AWS_BIN}" "${PYTHON_BIN}" "${ZIP_BIN}"; do
  command -v "${bin}" >/dev/null 2>&1 || {
    echo "필수 명령이 없습니다: ${bin}" >&2
    exit 1
  }
done

[[ -f "${TESTCASE_FILE}" ]] || {
  echo "테스트케이스 파일을 찾을 수 없습니다: ${TESTCASE_FILE}" >&2
  exit 1
}

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
BOT_NAME="${BOT_NAME:-FinanceInvestBot}"
BOT_ALIAS_NAME="${BOT_ALIAS_NAME:-DEV}"
LOCALE_ID="${LOCALE_ID:-ko_KR}"
LEX_ROLE_NAME="${LEX_ROLE_NAME:-LexLabServiceRole}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

json_result_intent_state() {
  local file="$1"
  "${PYTHON_BIN}" - "$file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
intent = (((data.get("sessionState") or {}).get("intent") or {}).get("name")) or ""
state = (((data.get("sessionState") or {}).get("intent") or {}).get("state")) or ""
print(f"{intent}\t{state}")
PY
}

emit_single_turn_cases() {
  "${PYTHON_BIN}" - "${TESTCASE_FILE}" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
for item in data.get("singleTurnCases", []):
    fields = [
        item.get("id", ""),
        item.get("text", ""),
        item.get("expectedIntent", ""),
        item.get("expectedState", ""),
    ]
    print("\t".join(str(x).replace("\t", " ").replace("\n", " ") for x in fields))
PY
}

emit_scenarios() {
  "${PYTHON_BIN}" - "${TESTCASE_FILE}" <<'PY'
import base64, json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
for item in data.get("multiTurnScenarios", []):
    raw = json.dumps(item, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    print(base64.b64encode(raw).decode("ascii"))
PY
}

emit_turns() {
  local scenario_json="$1"
  "${PYTHON_BIN}" - "$scenario_json" <<'PY'
import base64, json, sys
data = json.loads(sys.argv[1])
for item in data.get("turns", []):
    raw = json.dumps(item, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    print(base64.b64encode(raw).decode("ascii"))
PY
}

json_field() {
  local json_payload="$1"
  local field="$2"
  "${PYTHON_BIN}" - "$json_payload" "$field" <<'PY'
import json, sys
data = json.loads(sys.argv[1])
value = data.get(sys.argv[2], "")
print("" if value is None else value)
PY
}

package_lambda() {
  rm -rf "${TMP_DIR}/lambda"
  mkdir -p "${TMP_DIR}/lambda"
  cp "${ROOT_DIR}/lambda/fulfillment.js" "${TMP_DIR}/lambda/index.js"
  (
    cd "${TMP_DIR}/lambda"
    "${ZIP_BIN}" -qr "${TMP_DIR}/lex-fulfillment.zip" .
  )
}

upsert_lambda() {
  local function_arn

  log "1/4 Lambda 함수 준비"
  package_lambda

  if "${AWS_BIN}" --region "${AWS_REGION}" lambda get-function --function-name "${LAMBDA_FUNCTION_NAME}" >/dev/null 2>&1; then
    "${AWS_BIN}" --region "${AWS_REGION}" lambda update-function-code \
      --function-name "${LAMBDA_FUNCTION_NAME}" \
      --zip-file "fileb://${TMP_DIR}/lex-fulfillment.zip" >/dev/null
    log " - 기존 Lambda 코드 업데이트: ${LAMBDA_FUNCTION_NAME}"
  else
    [[ -n "${LAMBDA_EXEC_ROLE_ARN}" ]] || {
      echo "Lambda 함수가 없어서 새로 생성해야 합니다." >&2
      echo "환경변수 LAMBDA_EXEC_ROLE_ARN 또는 LAMBDA_ROLE_ARN을 설정해 주세요." >&2
      exit 1
    }

    "${AWS_BIN}" --region "${AWS_REGION}" lambda create-function \
      --function-name "${LAMBDA_FUNCTION_NAME}" \
      --runtime "${LAMBDA_RUNTIME}" \
      --handler "${LAMBDA_HANDLER}" \
      --role "${LAMBDA_EXEC_ROLE_ARN}" \
      --zip-file "fileb://${TMP_DIR}/lex-fulfillment.zip" >/dev/null
    log " - 새 Lambda 생성: ${LAMBDA_FUNCTION_NAME}"
  fi

  function_arn="$("${AWS_BIN}" --region "${AWS_REGION}" lambda get-function \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --query 'Configuration.FunctionArn' \
    --output text)"

  export LAMBDA_ARN="${function_arn}"
  log " - LAMBDA_ARN=${LAMBDA_ARN}"
}

bootstrap_lex() {
  log "2/4 Lex 봇/인텐트/슬롯 생성"

  local output_file="${TMP_DIR}/bootstrap.out"
  LAMBDA_ARN="${LAMBDA_ARN:-}" "${PYTHON_BIN}" "${ROOT_DIR}/infra/lex-bootstrap.py" | tee "${output_file}"

  export LEX_BOT_ID="$(grep '^export LEX_BOT_ID=' "${output_file}" | tail -1 | cut -d= -f2-)"
  export LEX_BOT_ALIAS_ID="$(grep '^export LEX_BOT_ALIAS_ID=' "${output_file}" | tail -1 | cut -d= -f2-)"
  export LEX_LOCALE_ID="$(grep '^export LEX_LOCALE_ID=' "${output_file}" | tail -1 | cut -d= -f2-)"

  [[ -n "${LEX_BOT_ID}" && -n "${LEX_BOT_ALIAS_ID}" && -n "${LEX_LOCALE_ID}" ]] || {
    echo "Lex bootstrap 결과에서 BOT_ID / BOT_ALIAS_ID / LOCALE_ID를 읽지 못했습니다." >&2
    exit 1
  }
}

grant_lex_permission() {
  log "3/4 Lex -> Lambda invoke 권한 반영"
  local account_id statement_id source_arn
  account_id="$("${AWS_BIN}" --region "${AWS_REGION}" sts get-caller-identity --query Account --output text)"
  statement_id="LexInvokePermission-${LEX_BOT_ID}-${LEX_BOT_ALIAS_ID}"
  source_arn="arn:aws:lex:${AWS_REGION}:${account_id}:bot-alias/${LEX_BOT_ID}/${LEX_BOT_ALIAS_ID}"

  "${AWS_BIN}" --region "${AWS_REGION}" lambda add-permission \
    --function-name "${LAMBDA_ARN}" \
    --statement-id "${statement_id}" \
    --action lambda:InvokeFunction \
    --principal lexv2.amazonaws.com \
    --source-arn "${source_arn}" >/dev/null 2>&1 || true
  write_env_snapshot
}

write_env_snapshot() {
  cat > "${OUTPUT_ENV_FILE}" <<EOF
export AWS_REGION=${AWS_REGION}
export LEX_BOT_ID=${LEX_BOT_ID:-}
export LEX_BOT_ALIAS_ID=${LEX_BOT_ALIAS_ID:-}
export LEX_LOCALE_ID=${LEX_LOCALE_ID:-${LOCALE_ID}}
export LAMBDA_ARN=${LAMBDA_ARN:-}
export BOT_NAME=${BOT_NAME}
export BOT_ALIAS_NAME=${BOT_ALIAS_NAME}
EOF

  log " - 환경변수 스냅샷 저장: ${OUTPUT_ENV_FILE}"
}

recognize_text() {
  local session_id="$1"
  local text="$2"
  "${AWS_BIN}" --region "${AWS_REGION}" lexv2-runtime recognize-text \
    --bot-id "${LEX_BOT_ID}" \
    --bot-alias-id "${LEX_BOT_ALIAS_ID}" \
    --locale-id "${LEX_LOCALE_ID}" \
    --session-id "${session_id}" \
    --text "${text}" \
    --output json
}

run_single_turn_tests() {
  local total=0 passed=0
  while IFS=$'\t' read -r case_id text expected_intent expected_state; do
    [[ -n "${case_id}" ]] || continue
    total=$((total + 1))
    local session_id="single-${case_id}"
    local result_file="${TMP_DIR}/${session_id}.json"
    recognize_text "${session_id}" "${text}" > "${result_file}"

    local actual_intent actual_state
    IFS=$'\t' read -r actual_intent actual_state < <(json_result_intent_state "${result_file}")

    if [[ "${actual_intent}" == "${expected_intent}" ]] && { [[ -z "${expected_state}" ]] || [[ "${actual_state}" == "${expected_state}" ]]; }; then
      printf '  [PASS] %s -> %s (%s)\n' "${case_id}" "${actual_intent}" "${actual_state:-n/a}"
      passed=$((passed + 1))
    else
      printf '  [FAIL] %s\n' "${case_id}"
      printf '         text: %s\n' "${text}"
      printf '         expected: intent=%s state=%s\n' "${expected_intent}" "${expected_state:-*}"
      printf '         actual:   intent=%s state=%s\n' "${actual_intent}" "${actual_state}"
    fi
  done < <(emit_single_turn_cases)

  printf '  single-turn result: %d/%d passed\n' "${passed}" "${total}"
  [[ "${passed}" -eq "${total}" ]]
}

run_multi_turn_scenarios() {
  local scenario_count=0 scenario_passed=0
  while IFS= read -r scenario_b64; do
    [[ -n "${scenario_b64}" ]] || continue
    scenario_count=$((scenario_count + 1))

    local scenario_json scenario_id scenario_name session_id turn_fail=0
    scenario_json="$(printf '%s' "${scenario_b64}" | base64 -d)"
    scenario_id="$(json_field "${scenario_json}" "id")"
    scenario_name="$(json_field "${scenario_json}" "name")"
    session_id="scenario-${scenario_id}"

    printf '  [SCENARIO] %s - %s\n' "${scenario_id}" "${scenario_name}"

    while IFS= read -r turn_b64; do
      local turn_json text expected_intent expected_state result_file actual_intent actual_state
      turn_json="$(printf '%s' "${turn_b64}" | base64 -d)"
      text="$(json_field "${turn_json}" "text")"
      expected_intent="$(json_field "${turn_json}" "expectedIntent")"
      expected_state="$(json_field "${turn_json}" "expectedState")"
      result_file="${TMP_DIR}/${session_id}-$(date +%s%N).json"

      recognize_text "${session_id}" "${text}" > "${result_file}"
      IFS=$'\t' read -r actual_intent actual_state < <(json_result_intent_state "${result_file}")

      if [[ "${actual_intent}" == "${expected_intent}" ]] && { [[ -z "${expected_state}" ]] || [[ "${actual_state}" == "${expected_state}" ]]; }; then
        printf '    [PASS] %s -> %s (%s)\n' "${text}" "${actual_intent}" "${actual_state:-n/a}"
      else
        printf '    [FAIL] %s\n' "${text}"
        printf '           expected: intent=%s state=%s\n' "${expected_intent}" "${expected_state:-*}"
        printf '           actual:   intent=%s state=%s\n' "${actual_intent}" "${actual_state}"
        turn_fail=1
      fi
    done < <(emit_turns "${scenario_json}")

    if [[ "${turn_fail}" -eq 0 ]]; then
      scenario_passed=$((scenario_passed + 1))
    fi
  done < <(emit_scenarios)

  printf '  multi-turn result: %d/%d scenarios passed\n' "${scenario_passed}" "${scenario_count}"
  [[ "${scenario_passed}" -eq "${scenario_count}" ]]
}

run_tests() {
  log "4/4 seed 테스트케이스 검증"
  run_single_turn_tests
  run_multi_turn_scenarios
}

main() {
  if [[ "${RUN_LAMBDA_STEP}" == "true" ]]; then
    upsert_lambda
  else
    export LAMBDA_ARN="${LAMBDA_ARN:-}"
  fi

  if [[ "${RUN_BOOTSTRAP_STEP}" == "true" ]]; then
    bootstrap_lex
    grant_lex_permission
  else
    : "${LEX_BOT_ID:?LEX_BOT_ID is required when RUN_BOOTSTRAP_STEP=false}"
    : "${LEX_BOT_ALIAS_ID:?LEX_BOT_ALIAS_ID is required when RUN_BOOTSTRAP_STEP=false}"
    export LEX_LOCALE_ID="${LEX_LOCALE_ID:-${LOCALE_ID}}"
    write_env_snapshot
  fi

  if [[ "${RUN_TEST_STEP}" == "true" ]]; then
    run_tests
  fi

  log "완료"
  echo "source ${OUTPUT_ENV_FILE}"
}

main "$@"
