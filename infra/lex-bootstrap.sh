#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Amazon Lex V2 자동 생성 스크립트 (CLI) - Idempotent Edition (FIXED v6.2)
#
# v6.2 Fix
# - BotAlias 생성/갱신 전에 Bot 상태가 Available 이 될 때까지 대기 (Creating 회피)
# - BotAlias 생성/갱신 후에도 aliasStatus=Available 될 때까지 대기
# - built-in slot type 캐시가 비어있으면 자동 재생성 + FORCE_REFRESH_BUILTIN_CACHE=true 지원
#
# NOTE (ko_KR)
# - Date/Time/Phone/Name 전용 built-in이 없을 수 있습니다.
#   이 경우 AMAZON.AlphaNumeric로 수집 후 CodeHook(Lambda)에서 정규화/검증하세요.
# ============================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="${ROOT_DIR}/infra/config.env"
[[ -f "${CFG}" ]] || CFG="${ROOT_DIR}/infra/config.example.env"
# shellcheck disable=SC1090
source "${CFG}"

AWS_BIN="${AWS_BIN:-aws}"
JQ_BIN="${JQ_BIN:-jq}"
AWS="${AWS_BIN} --region ${AWS_REGION}"

command -v "${AWS_BIN}" >/dev/null 2>&1 || { echo "aws CLI가 필요합니다." >&2; exit 1; }
command -v "${JQ_BIN}"  >/dev/null 2>&1 || { echo "jq가 필요합니다. (sudo apt-get install -y jq)" >&2; exit 1; }

REUSE_EXISTING_BOT="${REUSE_EXISTING_BOT:-true}"
CREATE_NEW_VERSION="${CREATE_NEW_VERSION:-true}"
FORCE_REFRESH_BUILTIN_CACHE="${FORCE_REFRESH_BUILTIN_CACHE:-false}"

TMP_DIR="${TMP_DIR:-/tmp}"
BUILTIN_CACHE_FILE="${TMP_DIR}/lexv2_builtin_slot_types_${LOCALE_ID}.txt"

# -----------------------------
# Wait helpers
# -----------------------------
wait_bot_available() {
  local bot_id="$1"
  local max_wait="${2:-300}" interval="${3:-5}" waited=0
  echo " - Bot Available 대기: botId=${bot_id}" >&2
  while true; do
    local status
    status="$(${AWS} lexv2-models describe-bot --bot-id "${bot_id}" --query botStatus --output text 2>/dev/null || echo "Unknown")"
    echo "   * botStatus=${status}" >&2
    [[ "${status}" == "Available" ]] && return 0
    if [[ "${status}" == "Failed" ]]; then
      echo "Bot 실패:" >&2
      ${AWS} lexv2-models describe-bot --bot-id "${bot_id}" --output json | ${JQ_BIN} . >&2
      return 1
    fi
    sleep "${interval}"
    waited=$(( waited + interval ))
    (( waited >= max_wait )) && { echo "Timed out: Bot Available 대기 실패" >&2; return 1; }
  done
}

wait_alias_available() {
  local bot_id="$1" alias_id="$2"
  local max_wait="${3:-300}" interval="${4:-5}" waited=0
  echo " - Alias Available 대기: botAliasId=${alias_id}" >&2
  while true; do
    local status
    status="$(${AWS} lexv2-models describe-bot-alias --bot-id "${bot_id}" --bot-alias-id "${alias_id}" --query botAliasStatus --output text 2>/dev/null || echo "Unknown")"
    echo "   * botAliasStatus=${status}" >&2
    [[ "${status}" == "Available" ]] && return 0
    if [[ "${status}" == "Failed" ]]; then
      echo "Alias 실패:" >&2
      ${AWS} lexv2-models describe-bot-alias --bot-id "${bot_id}" --bot-alias-id "${alias_id}" --output json | ${JQ_BIN} . >&2
      return 1
    fi
    sleep "${interval}"
    waited=$(( waited + interval ))
    (( waited >= max_wait )) && { echo "Timed out: Alias Available 대기 실패" >&2; return 1; }
  done
}

wait_locale_not_creating() {
  local bot_id="$1" locale_id="$2"
  local max_wait="${3:-300}" interval="${4:-5}" waited=0
  echo " - Locale 상태 대기(Creating 탈출): ${locale_id}" >&2
  while true; do
    local status
    status="$(${AWS} lexv2-models describe-bot-locale \
      --bot-id "${bot_id}" --bot-version "DRAFT" --locale-id "${locale_id}" \
      --query botLocaleStatus --output text 2>/dev/null || echo "Unknown")"
    echo "   * botLocaleStatus=${status}" >&2
    if [[ "${status}" != "Creating" && "${status}" != "Unknown" ]]; then
      return 0
    fi
    if [[ "${status}" == "Failed" ]]; then
      echo "Locale 실패:" >&2
      ${AWS} lexv2-models describe-bot-locale \
        --bot-id "${bot_id}" --bot-version "DRAFT" --locale-id "${locale_id}" --output json | ${JQ_BIN} . >&2
      return 1
    fi
    sleep "${interval}"
    waited=$(( waited + interval ))
    (( waited >= max_wait )) && { echo "Timed out: Locale 대기 실패" >&2; return 1; }
  done
}

wait_locale_built() {
  local bot_id="$1" locale_id="$2"
  local max_wait="${3:-900}" interval="${4:-10}" waited=0
  echo " - Build 완료 대기: ${locale_id}" >&2
  while true; do
    local status
    status="$(${AWS} lexv2-models describe-bot-locale \
      --bot-id "${bot_id}" --bot-version "DRAFT" --locale-id "${locale_id}" \
      --query botLocaleStatus --output text)"
    echo "   * status=${status}" >&2
    [[ "${status}" == "Built" ]] && return 0
    if [[ "${status}" == "Failed" ]]; then
      echo "Build 실패:" >&2
      ${AWS} lexv2-models describe-bot-locale \
        --bot-id "${bot_id}" --bot-version "DRAFT" --locale-id "${locale_id}" --output json | ${JQ_BIN} . >&2
      return 1
    fi
    sleep "${interval}"
    waited=$(( waited + interval ))
    (( waited >= max_wait )) && { echo "Timed out: Build 대기 실패" >&2; return 1; }
  done
}

# -----------------------------
# Find helpers
# -----------------------------
find_latest_bot_id_by_name() {
  ${AWS} lexv2-models list-bots --max-results 50 \
    --query "sort_by(botSummaries[?botName=='${BOT_NAME}'], &lastUpdatedDateTime)[-1].botId" \
    --output text 2>/dev/null || true
}

find_slot_type_id_by_name() {
  local bot_id="$1" locale_id="$2" name="$3"
  ${AWS} lexv2-models list-slot-types --bot-id "${bot_id}" --bot-version "DRAFT" --locale-id "${locale_id}" --max-results 100 \
    --query "slotTypeSummaries[?slotTypeName=='${name}'].slotTypeId | [0]" --output text 2>/dev/null || true
}

find_intent_id_by_name() {
  local bot_id="$1" locale_id="$2" name="$3"
  ${AWS} lexv2-models list-intents --bot-id "${bot_id}" --bot-version "DRAFT" --locale-id "${locale_id}" --max-results 100 \
    --query "intentSummaries[?intentName=='${name}'].intentId | [0]" --output text 2>/dev/null || true
}

find_slot_id_by_name() {
  local bot_id="$1" locale_id="$2" intent_id="$3" slot_name="$4"
  ${AWS} lexv2-models list-slots \
    --bot-id "${bot_id}" --bot-version "DRAFT" --locale-id "${locale_id}" --intent-id "${intent_id}" --max-results 100 \
    --query "slotSummaries[?slotName=='${slot_name}'].slotId | [0]" --output text 2>/dev/null || true
}

find_alias_id_by_name() {
  local bot_id="$1" alias_name="$2"
  ${AWS} lexv2-models list-bot-aliases --bot-id "${bot_id}" --max-results 50 \
    --query "botAliasSummaries[?botAliasName=='${alias_name}'].botAliasId | [0]" --output text 2>/dev/null || true
}

# -----------------------------
# Utilities
# -----------------------------
make_enums() {
  local -n arr=$1
  local out='[' first=1
  for v in "${arr[@]}"; do
    v="$(echo "$v" | xargs)"
    [[ -z "$v" ]] && continue
    [[ $first -eq 0 ]] && out+=','
    first=0
    out+="{\"sampleValue\":{\"value\":\"${v}\"}}"
  done
  out+=']'
  echo "$out"
}

assert_id() {
  local label="$1" v="$2"
  if [[ ! "${v}" =~ ^[0-9A-Za-z]{1,10}$ ]]; then
    echo "ERROR: ${label} 값이 비정상입니다: '${v}'" >&2
    exit 1
  fi
}

# -----------------------------
# Built-in slot types cache
# -----------------------------
cache_builtin_slot_types() {
  if [[ "${FORCE_REFRESH_BUILTIN_CACHE}" == "true" ]]; then
    rm -f "${BUILTIN_CACHE_FILE}" || true
  fi

  if [[ -f "${BUILTIN_CACHE_FILE}" ]]; then
    if [[ -s "${BUILTIN_CACHE_FILE}" ]]; then
      echo " - Built-in cache 사용: ${BUILTIN_CACHE_FILE} (lines=$(wc -l < "${BUILTIN_CACHE_FILE}" | tr -d ' '))" >&2
      return 0
    fi
    echo " - Built-in cache가 비어있어 재생성합니다: ${BUILTIN_CACHE_FILE}" >&2
    rm -f "${BUILTIN_CACHE_FILE}" || true
  fi

  echo " - Built-in slot types 캐시 생성: ${LOCALE_ID}" >&2
  local next_token=""
  : > "${BUILTIN_CACHE_FILE}"
  local page_size=20

  while true; do
    local json
    if [[ -n "${next_token}" ]]; then
      json="$(${AWS} lexv2-models list-built-in-slot-types --locale-id "${LOCALE_ID}" --max-results "${page_size}" --next-token "${next_token}" --output json)"
    else
      json="$(${AWS} lexv2-models list-built-in-slot-types --locale-id "${LOCALE_ID}" --max-results "${page_size}" --output json)"
    fi

    echo "${json}" | ${JQ_BIN} -r '.builtInSlotTypeSummaries[].slotTypeSignature' >> "${BUILTIN_CACHE_FILE}"
    next_token="$(echo "${json}" | ${JQ_BIN} -r '.nextToken // empty')"
    [[ -z "${next_token}" ]] && break
  done

  echo " - Built-in cache 생성 완료: ${BUILTIN_CACHE_FILE} (lines=$(wc -l < "${BUILTIN_CACHE_FILE}" | tr -d ' '))" >&2
}

builtin_exists() {
  local sig="$1"
  cache_builtin_slot_types
  grep -Fxq "${sig}" "${BUILTIN_CACHE_FILE}"
}

pick_supported_builtin_or_alphanum() {
  local c
  for c in "$@"; do
    if builtin_exists "${c}"; then
      echo "${c}"
      return 0
    fi
  done
  if builtin_exists "AMAZON.AlphaNumeric"; then
    echo "AMAZON.AlphaNumeric"
    return 0
  fi
  echo ""
}

# ============================================================
# [1/9] IAM Role
# ============================================================
echo "[1/9] IAM Role 준비: ${LEX_ROLE_NAME}"
ACCOUNT_ID="$(${AWS} sts get-caller-identity --query Account --output text)"
LEX_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${LEX_ROLE_NAME}"

if ! ${AWS} iam get-role --role-name "${LEX_ROLE_NAME}" >/dev/null 2>&1; then
  cat > /tmp/lexv2-trust.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lexv2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

  ${AWS} iam create-role \
    --role-name "${LEX_ROLE_NAME}" \
    --assume-role-policy-document file:///tmp/lexv2-trust.json >/dev/null

  INVOKE_RESOURCE="*"
  [[ -n "${LAMBDA_ARN:-}" ]] && INVOKE_RESOURCE="${LAMBDA_ARN}"

  cat > /tmp/lexv2-inline-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeLambdaForFulfillment",
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": ["${INVOKE_RESOURCE}"]
    },
    {
      "Sid": "CloudWatchLogsBasic",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
      "Resource": "*"
    }
  ]
}
JSON

  ${AWS} iam put-role-policy \
    --role-name "${LEX_ROLE_NAME}" \
    --policy-name "LexLabInlinePolicy" \
    --policy-document file:///tmp/lexv2-inline-policy.json >/dev/null

  echo " - 생성 완료: ${LEX_ROLE_ARN}"
else
  echo " - 이미 존재: ${LEX_ROLE_ARN}"
fi

# ============================================================
# [2/9] Bot get-or-create
# ============================================================
echo "[2/9] Bot 생성 또는 재사용: ${BOT_NAME}"

BOT_ID="${BOT_ID:-}"

if [[ -z "${BOT_ID}" && "${REUSE_EXISTING_BOT}" == "true" ]]; then
  EXISTING_BOT_ID="$(find_latest_bot_id_by_name)"
  if [[ -n "${EXISTING_BOT_ID}" && "${EXISTING_BOT_ID}" != "None" ]]; then
    BOT_ID="${EXISTING_BOT_ID}"
    echo " - 기존 Bot 재사용: botId=${BOT_ID}"
  fi
fi

if [[ -z "${BOT_ID}" ]]; then
  BOT_JSON="$(${AWS} lexv2-models create-bot \
    --bot-name "${BOT_NAME}" \
    --description "${BOT_DESCRIPTION}" \
    --role-arn "${LEX_ROLE_ARN}" \
    --data-privacy childDirected=false \
    --idle-session-ttl-in-seconds "${IDLE_SESSION_TTL}" \
    --output json)"
  BOT_ID="$(echo "${BOT_JSON}" | ${JQ_BIN} -r .botId)"
  echo " - botId=${BOT_ID}"
else
  echo " - botId=${BOT_ID}"
fi

wait_bot_available "${BOT_ID}" 300 5

# ============================================================
# [3/9] Locale get-or-create
# ============================================================
echo "[3/9] Locale 생성/확인: ${LOCALE_ID}"

if ${AWS} lexv2-models describe-bot-locale --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" >/dev/null 2>&1; then
  echo " - 이미 존재: ${LOCALE_ID}"
else
  ${AWS} lexv2-models create-bot-locale \
    --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
    --nlu-intent-confidence-threshold "${NLU_CONFIDENCE}" >/dev/null
  echo " - 생성 요청 완료"
fi

wait_locale_not_creating "${BOT_ID}" "${LOCALE_ID}" 300 5

# ============================================================
# [4/9] SlotTypes (custom enum)
# ============================================================
echo "[4/9] SlotType 생성/갱신"
IFS=',' read -r -a BRANCH_ARR <<< "${BRANCH_VALUES}"
IFS=',' read -r -a COURSE_ARR <<< "${COURSE_VALUES}"
BRANCH_ENUMS="$(make_enums BRANCH_ARR)"
COURSE_ENUMS="$(make_enums COURSE_ARR)"

BRANCH_SLOT_TYPE_ID="$(find_slot_type_id_by_name "${BOT_ID}" "${LOCALE_ID}" "BranchType")"
if [[ -z "${BRANCH_SLOT_TYPE_ID}" || "${BRANCH_SLOT_TYPE_ID}" == "None" ]]; then
  BRANCH_SLOT_JSON="$(${AWS} lexv2-models create-slot-type \
    --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
    --slot-type-name "BranchType" \
    --description "학원 지점" \
    --slot-type-values "${BRANCH_ENUMS}" \
    --value-selection-setting "resolutionStrategy=TopResolution" \
    --output json)"
  BRANCH_SLOT_TYPE_ID="$(echo "${BRANCH_SLOT_JSON}" | ${JQ_BIN} -r .slotTypeId)"
  echo " - BranchType 생성: ${BRANCH_SLOT_TYPE_ID}"
else
  ${AWS} lexv2-models update-slot-type \
    --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
    --slot-type-id "${BRANCH_SLOT_TYPE_ID}" \
    --slot-type-name "BranchType" \
    --description "학원 지점" \
    --slot-type-values "${BRANCH_ENUMS}" \
    --value-selection-setting "resolutionStrategy=TopResolution" >/dev/null
  echo " - BranchType 갱신: ${BRANCH_SLOT_TYPE_ID}"
fi

COURSE_SLOT_TYPE_ID="$(find_slot_type_id_by_name "${BOT_ID}" "${LOCALE_ID}" "CourseType")"
if [[ -z "${COURSE_SLOT_TYPE_ID}" || "${COURSE_SLOT_TYPE_ID}" == "None" ]]; then
  COURSE_SLOT_JSON="$(${AWS} lexv2-models create-slot-type \
    --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
    --slot-type-name "CourseType" \
    --description "수강 과정" \
    --slot-type-values "${COURSE_ENUMS}" \
    --value-selection-setting "resolutionStrategy=TopResolution" \
    --output json)"
  COURSE_SLOT_TYPE_ID="$(echo "${COURSE_SLOT_JSON}" | ${JQ_BIN} -r .slotTypeId)"
  echo " - CourseType 생성: ${COURSE_SLOT_TYPE_ID}"
else
  ${AWS} lexv2-models update-slot-type \
    --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
    --slot-type-id "${COURSE_SLOT_TYPE_ID}" \
    --slot-type-name "CourseType" \
    --description "수강 과정" \
    --slot-type-values "${COURSE_ENUMS}" \
    --value-selection-setting "resolutionStrategy=TopResolution" >/dev/null
  echo " - CourseType 갱신: ${COURSE_SLOT_TYPE_ID}"
fi

# ============================================================
# [5/9] Intent + Slots (MakeReservation only in this edition)
# ============================================================
echo "[5/9] Intent 생성/갱신 + Slots 구성"

upsert_intent_base() {
  local name="$1" desc="$2" base_utter="$3"
  local intent_id
  intent_id="$(find_intent_id_by_name "${BOT_ID}" "${LOCALE_ID}" "${name}")"

  if [[ -z "${intent_id}" || "${intent_id}" == "None" ]]; then
    local j
    j="$(${AWS} lexv2-models create-intent \
      --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
      --intent-name "${name}" \
      --description "${desc}" \
      --sample-utterances "${base_utter}" \
      --output json)"
    intent_id="$(echo "${j}" | ${JQ_BIN} -r .intentId)"
    echo " - Intent 생성: ${name} (${intent_id})" >&2
  else
    ${AWS} lexv2-models update-intent \
      --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
      --intent-id "${intent_id}" \
      --intent-name "${name}" \
      --description "${desc}" \
      --sample-utterances "${base_utter}" >/dev/null
    echo " - Intent 갱신(BASE): ${name} (${intent_id})" >&2
  fi

  echo "${intent_id}"
}

create_or_update_slot() {
  local intent_id="$1" slot_name="$2" slot_type_sig="$3" required="$4" prompt="$5"

  if [[ "${slot_type_sig}" =~ ^AMAZON\. ]]; then
    if ! builtin_exists "${slot_type_sig}"; then
      echo "ERROR: ${slot_name}: built-in 미지원 ${slot_type_sig}" >&2
      return 1
    fi
  fi

  local constraint="Optional"
  [[ "${required}" == "true" ]] && constraint="Required"

  local slot_id
  slot_id="$(find_slot_id_by_name "${BOT_ID}" "${LOCALE_ID}" "${intent_id}" "${slot_name}")"

  local elicitation_json
  elicitation_json="$(${JQ_BIN} -nc \
    --arg c "${constraint}" \
    --arg p "${prompt}" \
    '{
      slotConstraint: $c,
      promptSpecification: {
        maxRetries: 2,
        messageGroups: [
          { message: { plainTextMessage: { value: $p } } }
        ]
      }
    }'
  )"

  if [[ -z "${slot_id}" || "${slot_id}" == "None" ]]; then
    local j
    j="$(${AWS} lexv2-models create-slot \
      --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
      --intent-id "${intent_id}" \
      --slot-name "${slot_name}" \
      --slot-type-id "${slot_type_sig}" \
      --value-elicitation-setting "${elicitation_json}" \
      --output json)"
    slot_id="$(echo "${j}" | ${JQ_BIN} -r '.slotId // empty')"
    echo "   • Slot 생성: ${slot_name} (${slot_id})" >&2
  else
    ${AWS} lexv2-models update-slot \
      --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
      --intent-id "${intent_id}" \
      --slot-id "${slot_id}" \
      --slot-name "${slot_name}" \
      --slot-type-id "${slot_type_sig}" \
      --value-elicitation-setting "${elicitation_json}" >/dev/null
    echo "   • Slot 갱신: ${slot_name} (${slot_id})" >&2
  fi

  [[ -z "${slot_id}" ]] && return 1
  echo "${slot_id}"
}

MAKE_UTT_BASE='[
  {"utterance":"상담 예약할래요"},
  {"utterance":"예약하고 싶어요"},
  {"utterance":"수강 상담 예약"}
]'
MAKE_UTT_FULL='[
  {"utterance":"강남점 토익 예약하고 싶어요"},
  {"utterance":"{Branch} {CourseName} 상담 예약할래요"},
  {"utterance":"{Date} {Time}에 {Branch} {CourseName} 예약"}
]'

MAKE_INTENT_ID="$(upsert_intent_base "MakeReservation" "상담/수강 예약 생성" "${MAKE_UTT_BASE}")"
assert_id "MAKE_INTENT_ID" "${MAKE_INTENT_ID}"

NAME_TYPE="$(pick_supported_builtin_or_alphanum "AMAZON.Person" "AMAZON.FirstName" "AMAZON.LastName")"
DATE_TYPE="$(pick_supported_builtin_or_alphanum "AMAZON.Date" "AMAZON.DateTime")"
TIME_TYPE="$(pick_supported_builtin_or_alphanum "AMAZON.Time" "AMAZON.DateTime")"
PHONE_TYPE="$(pick_supported_builtin_or_alphanum "AMAZON.PhoneNumber")"

if [[ -z "${NAME_TYPE}" || -z "${DATE_TYPE}" || -z "${TIME_TYPE}" || -z "${PHONE_TYPE}" ]]; then
  echo "ERROR: ko_KR에서 사용할 수 있는 built-in slot type을 찾지 못했습니다." >&2
  echo "캐시 파일 확인: ${BUILTIN_CACHE_FILE}" >&2
  echo "힌트: FORCE_REFRESH_BUILTIN_CACHE=true 로 캐시 강제 재생성 후 재시도" >&2
  exit 1
fi

echo " - SlotType 선택(ko_KR 지원 기반)" >&2
echo "   • StudentName=${NAME_TYPE}" >&2
echo "   • Date=${DATE_TYPE}" >&2
echo "   • Time=${TIME_TYPE}" >&2
echo "   • Phone=${PHONE_TYPE}" >&2

BRANCH_SLOT_ID="$(create_or_update_slot "${MAKE_INTENT_ID}" "Branch" "${BRANCH_SLOT_TYPE_ID}" true "어느 지점으로 예약할까요? (예: 강남점)")"
COURSE_SLOT_ID="$(create_or_update_slot "${MAKE_INTENT_ID}" "CourseName" "${COURSE_SLOT_TYPE_ID}" true "어떤 과정을 원하세요? (예: 토익)")"
DATE_SLOT_ID="$(create_or_update_slot "${MAKE_INTENT_ID}" "Date" "${DATE_TYPE}" true "희망 날짜를 알려주세요. (예: 2026-02-10 또는 2월 10일)")"
TIME_SLOT_ID="$(create_or_update_slot "${MAKE_INTENT_ID}" "Time" "${TIME_TYPE}" true "희망 시간을 알려주세요. (예: 19:30)")"
STUDENTNAME_SLOT_ID="$(create_or_update_slot "${MAKE_INTENT_ID}" "StudentName" "${NAME_TYPE}" true "예약자 이름을 알려주세요.")"
PHONE_SLOT_ID="$(create_or_update_slot "${MAKE_INTENT_ID}" "PhoneNumber" "${PHONE_TYPE}" true "연락처를 알려주세요. (예: 010-1234-5678)")"

for _id in "${BRANCH_SLOT_ID}" "${COURSE_SLOT_ID}" "${DATE_SLOT_ID}" "${TIME_SLOT_ID}" "${STUDENTNAME_SLOT_ID}" "${PHONE_SLOT_ID}"; do
  assert_id "slotId" "${_id}"
done

SLOT_PRI_JSON="$(${JQ_BIN} -nc \
  --arg s1 "${BRANCH_SLOT_ID}" \
  --arg s2 "${COURSE_SLOT_ID}" \
  --arg s3 "${DATE_SLOT_ID}" \
  --arg s4 "${TIME_SLOT_ID}" \
  --arg s5 "${STUDENTNAME_SLOT_ID}" \
  --arg s6 "${PHONE_SLOT_ID}" \
  '[{"priority":1,"slotId":$s1},
    {"priority":2,"slotId":$s2},
    {"priority":3,"slotId":$s3},
    {"priority":4,"slotId":$s4},
    {"priority":5,"slotId":$s5},
    {"priority":6,"slotId":$s6}]'
)"

${AWS} lexv2-models update-intent \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
  --intent-id "${MAKE_INTENT_ID}" \
  --intent-name "MakeReservation" \
  --description "상담/수강 예약 생성" \
  --sample-utterances "${MAKE_UTT_FULL}" \
  --slot-priorities "${SLOT_PRI_JSON}" \
  --fulfillment-code-hook "enabled=true" >/dev/null

echo "✅ [5/9] MakeReservation intent/slots OK"

# ============================================================
# [6/9] Build
# ============================================================
echo "[6/9] Locale Build 시작"
${AWS} lexv2-models build-bot-locale --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" >/dev/null
wait_locale_built "${BOT_ID}" "${LOCALE_ID}" 900 10

# ============================================================
# [7/9] Version
# ============================================================
echo "[7/9] Bot Version"
if [[ "${CREATE_NEW_VERSION}" == "true" ]]; then
  VER_JSON="$(${AWS} lexv2-models create-bot-version \
    --bot-id "${BOT_ID}" \
    --bot-version-locale-specification "{\"${LOCALE_ID}\":{\"sourceBotVersion\":\"DRAFT\"}}" \
    --output json)"
  BOT_VERSION="$(echo "${VER_JSON}" | ${JQ_BIN} -r .botVersion)"
  echo " - 새 버전 생성: ${BOT_VERSION}"
else
  BOT_VERSION="$(${AWS} lexv2-models list-bot-versions --bot-id "${BOT_ID}" --max-results 50 \
    --query "sort_by(botVersionSummaries[?botVersion!='DRAFT'], &creationDateTime)[-1].botVersion" --output text)"
  [[ -z "${BOT_VERSION}" || "${BOT_VERSION}" == "None" ]] && { echo "재사용할 버전이 없어 새 버전을 생성하세요." >&2; exit 1; }
  echo " - 기존 최신 버전 재사용: ${BOT_VERSION}"
fi

# ✅ v6.2: 버전 생성 직후 Bot이 Creating 상태로 잠깐 돌아갈 수 있어 대기
wait_bot_available "${BOT_ID}" 300 5

# ============================================================
# [8/9] Alias
# ============================================================
echo "[8/9] Alias 생성/갱신: ${BOT_ALIAS_NAME}"

if [[ -n "${LAMBDA_ARN:-}" ]]; then
  LOCALE_SETTINGS="$(cat <<JSON
{
  "${LOCALE_ID}": {
    "enabled": true,
    "codeHookSpecification": {
      "lambdaCodeHook": {
        "lambdaARN": "${LAMBDA_ARN}",
        "codeHookInterfaceVersion": "1.0"
      }
    }
  }
}
JSON
)"
else
  LOCALE_SETTINGS="$(cat <<JSON
{ "${LOCALE_ID}": { "enabled": true } }
JSON
)"
fi

ALIAS_ID="$(find_alias_id_by_name "${BOT_ID}" "${BOT_ALIAS_NAME}")"
if [[ -z "${ALIAS_ID}" || "${ALIAS_ID}" == "None" ]]; then
  # ✅ v6.2: alias 생성 전에 한번 더 bot 상태 확인
  wait_bot_available "${BOT_ID}" 300 5

  ALIAS_JSON="$(${AWS} lexv2-models create-bot-alias \
    --bot-id "${BOT_ID}" \
    --bot-alias-name "${BOT_ALIAS_NAME}" \
    --bot-version "${BOT_VERSION}" \
    --bot-alias-locale-settings "${LOCALE_SETTINGS}" \
    --output json)"
  ALIAS_ID="$(echo "${ALIAS_JSON}" | ${JQ_BIN} -r .botAliasId)"
  echo " - Alias 생성: ${ALIAS_ID}"
else
  # ✅ v6.2: alias 갱신 전 bot 상태 확인
  wait_bot_available "${BOT_ID}" 300 5

  ${AWS} lexv2-models update-bot-alias \
    --bot-id "${BOT_ID}" \
    --bot-alias-id "${ALIAS_ID}" \
    --bot-alias-name "${BOT_ALIAS_NAME}" \
    --bot-version "${BOT_VERSION}" \
    --bot-alias-locale-settings "${LOCALE_SETTINGS}" >/dev/null
  echo " - Alias 갱신: ${ALIAS_ID}"
fi

# ✅ v6.2: alias도 Available까지 대기 (바로 런타임 호출하려면 필수)
wait_alias_available "${BOT_ID}" "${ALIAS_ID}" 300 5

# ============================================================
# [9/9] Summary
# ============================================================
echo "[9/9] 결과 요약"
cat <<EOF
✅ 완료
- BOT_ID=${BOT_ID}
- BOT_VERSION=${BOT_VERSION}
- BOT_ALIAS_ID=${ALIAS_ID}
- LOCALE_ID=${LOCALE_ID}

Node 서버에서 사용할 환경변수:
export AWS_REGION=${AWS_REGION}
export LEX_BOT_ID=${BOT_ID}
export LEX_BOT_ALIAS_ID=${ALIAS_ID}
export LEX_LOCALE_ID=${LOCALE_ID}

(참고) ko_KR에서 Date/Time 전용 built-in이 없으면 AMAZON.AlphaNumeric로 수집됩니다.
→ CodeHook(Lambda)에서 정규화/검증 권장.

EOF
