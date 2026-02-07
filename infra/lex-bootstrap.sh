#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Amazon Lex V2 자동 생성 스크립트 (CLI)
# - Bot / Locale / SlotTypes / Intents / Slots
# - Build Locale → Create Version → Create Alias(옵션: Lambda CodeHook)
#
# 필요 도구: aws, jq
# 실행:
#   cp infra/config.example.env infra/config.env
#   vi infra/config.env  (LEX/Lambda 값 수정)
#   bash infra/lex-bootstrap.sh
# ============================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="${ROOT_DIR}/infra/config.env"
[[ -f "${CFG}" ]] || CFG="${ROOT_DIR}/infra/config.example.env"

# shellcheck disable=SC1090
source "${CFG}"

AWS_BIN="${AWS_BIN:-aws}"
JQ_BIN="${JQ_BIN:-jq}"

command -v "${AWS_BIN}" >/dev/null 2>&1 || { echo "aws CLI가 필요합니다."; exit 1; }
command -v "${JQ_BIN}"  >/dev/null 2>&1 || { echo "jq가 필요합니다. (sudo apt-get install -y jq)"; exit 1; }

AWS="${AWS_BIN} --region ${AWS_REGION}"

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

  # 최소 정책(실습용): Lambda invoke (ARN이 있으면 제한), CloudWatch Logs 권한(일부 환경에서 필요)
  if [[ -n "${LAMBDA_ARN:-}" ]]; then
    INVOKE_RESOURCE="${LAMBDA_ARN}"
  else
    INVOKE_RESOURCE="*"
  fi

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
      "Action": [
        "logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"
      ],
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

echo "[2/9] Bot 생성: ${BOT_NAME}"
BOT_JSON="$(${AWS} lexv2-models create-bot \
  --bot-name "${BOT_NAME}" \
  --description "${BOT_DESCRIPTION}" \
  --role-arn "${LEX_ROLE_ARN}" \
  --data-privacy childDirected=false \
  --idle-session-ttl-in-seconds "${IDLE_SESSION_TTL}" \
  --output json)"

BOT_ID="$(echo "${BOT_JSON}" | ${JQ_BIN} -r .botId)"
echo " - botId=${BOT_ID}"

echo "[3/9] Locale 생성: ${LOCALE_ID}"
${AWS} lexv2-models create-bot-locale \
  --bot-id "${BOT_ID}" \
  --bot-version "DRAFT" \
  --locale-id "${LOCALE_ID}" \
  --nlu-intent-confidence-threshold "${NLU_CONFIDENCE}" >/dev/null

echo "[4/9] SlotType 생성"
IFS=',' read -r -a BRANCH_ARR <<< "${BRANCH_VALUES}"
IFS=',' read -r -a COURSE_ARR <<< "${COURSE_VALUES}"

make_enums() {
  local -n arr=$1
  local out='['
  local first=1
  for v in "${arr[@]}"; do
    v="$(echo "$v" | xargs)"
    [[ -z "$v" ]] && continue
    if [[ $first -eq 0 ]]; then out+=','; fi
    first=0
    out+="{\"sampleValue\":{\"value\":\"${v}\"}}"
  done
  out+=']'
  echo "$out"
}

BRANCH_ENUMS="$(make_enums BRANCH_ARR)"
COURSE_ENUMS="$(make_enums COURSE_ARR)"

BRANCH_SLOT_JSON="$(${AWS} lexv2-models create-slot-type \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
  --slot-type-name "BranchType" \
  --description "학원 지점" \
  --slot-type-values "${BRANCH_ENUMS}" \
  --value-selection-setting selectionStrategy=TOP_RESOLUTION \
  --output json)"
BRANCH_SLOT_TYPE_ID="$(echo "${BRANCH_SLOT_JSON}" | ${JQ_BIN} -r .slotTypeId)"

COURSE_SLOT_JSON="$(${AWS} lexv2-models create-slot-type \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
  --slot-type-name "CourseType" \
  --description "수강 과정" \
  --slot-type-values "${COURSE_ENUMS}" \
  --value-selection-setting selectionStrategy=TOP_RESOLUTION \
  --output json)"
COURSE_SLOT_TYPE_ID="$(echo "${COURSE_SLOT_JSON}" | ${JQ_BIN} -r .slotTypeId)"

echo " - BranchType=${BRANCH_SLOT_TYPE_ID}"
echo " - CourseType=${COURSE_SLOT_TYPE_ID}"

echo "[5/9] Intent 생성 + Slots 구성"

# 헬퍼: intent 생성
create_intent () {
  local name="$1"
  local desc="$2"
  local utter="$3"  # JSON array string
  ${AWS} lexv2-models create-intent \
    --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
    --intent-name "${name}" \
    --description "${desc}" \
    --sample-utterances "${utter}" \
    --output json
}

# 헬퍼: slot 생성
create_slot () {
  local intent_id="$1"
  local slot_name="$2"
  local slot_type_id="$3"
  local required="$4" # true/false
  local prompt="$5"

  local constraint="Optional"
  [[ "${required}" == "true" ]] && constraint="Required"

  ${AWS} lexv2-models create-slot \
    --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
    --intent-id "${intent_id}" \
    --slot-name "${slot_name}" \
    --slot-type-id "${slot_type_id}" \
    --slot-constraint "${constraint}" \
    --value-elicitation-setting "slotConstraint=${constraint},promptSpecification={maxRetries=2,messageGroups=[{message={plainTextMessage={value=\"${prompt}\"}}}]}" \
    --output json
}

# MakeReservation
MAKE_UTT='[
  {"utterance":"강남점 토익 예약하고 싶어요"},
  {"utterance":"{Branch} {CourseName} 상담 예약할래요"},
  {"utterance":"{Date} {Time}에 {Branch} {CourseName} 예약"}
]'
MAKE_INTENT_JSON="$(create_intent "MakeReservation" "상담/수강 예약 생성" "${MAKE_UTT}")"
MAKE_INTENT_ID="$(echo "${MAKE_INTENT_JSON}" | ${JQ_BIN} -r .intentId)"

S1_JSON="$(create_slot "${MAKE_INTENT_ID}" "Branch" "${BRANCH_SLOT_TYPE_ID}" true "어느 지점으로 예약할까요? (예: 강남점)")"
S2_JSON="$(create_slot "${MAKE_INTENT_ID}" "CourseName" "${COURSE_SLOT_TYPE_ID}" true "어떤 과정을 원하세요? (예: 토익)")"
S3_JSON="$(create_slot "${MAKE_INTENT_ID}" "Date" "AMAZON.Date" true "희망 날짜를 알려주세요. (예: 2월 10일)")"
S4_JSON="$(create_slot "${MAKE_INTENT_ID}" "Time" "AMAZON.Time" true "희망 시간을 알려주세요. (예: 19:30)")"
S5_JSON="$(create_slot "${MAKE_INTENT_ID}" "StudentName" "AMAZON.Person" true "예약자 이름을 알려주세요.")"
S6_JSON="$(create_slot "${MAKE_INTENT_ID}" "PhoneNumber" "AMAZON.PhoneNumber" true "연락처를 알려주세요. (예: 010-1234-5678)")"

BRANCH_SLOT_ID="$(echo "${S1_JSON}" | ${JQ_BIN} -r .slotId)"
COURSE_SLOT_ID="$(echo "${S2_JSON}" | ${JQ_BIN} -r .slotId)"
DATE_SLOT_ID="$(echo "${S3_JSON}" | ${JQ_BIN} -r .slotId)"
TIME_SLOT_ID="$(echo "${S4_JSON}" | ${JQ_BIN} -r .slotId)"
NAME_SLOT_ID="$(echo "${S5_JSON}" | ${JQ_BIN} -r .slotId)"
PHONE_SLOT_ID="$(echo "${S6_JSON}" | ${JQ_BIN} -r .slotId)"

# slotPriorities + fulfillment hook
${AWS} lexv2-models update-intent \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
  --intent-id "${MAKE_INTENT_ID}" \
  --intent-name "MakeReservation" \
  --sample-utterances "${MAKE_UTT}" \
  --slot-priorities "[
    {\"priority\":1,\"slotId\":\"${BRANCH_SLOT_ID}\"},
    {\"priority\":2,\"slotId\":\"${COURSE_SLOT_ID}\"},
    {\"priority\":3,\"slotId\":\"${DATE_SLOT_ID}\"},
    {\"priority\":4,\"slotId\":\"${TIME_SLOT_ID}\"},
    {\"priority\":5,\"slotId\":\"${NAME_SLOT_ID}\"},
    {\"priority\":6,\"slotId\":\"${PHONE_SLOT_ID}\"}
  ]" \
  --fulfillment-code-hook "enabled=true" >/dev/null

# CheckReservation
CHECK_UTT='[
  {"utterance":"예약 조회해줘"},
  {"utterance":"예약번호 {ReservationId} 조회"},
  {"utterance":"내 예약 확인"}
]'
CHECK_INTENT_JSON="$(create_intent "CheckReservation" "예약 조회" "${CHECK_UTT}")"
CHECK_INTENT_ID="$(echo "${CHECK_INTENT_JSON}" | ${JQ_BIN} -r .intentId)"
CR_JSON="$(create_slot "${CHECK_INTENT_ID}" "ReservationId" "AMAZON.AlphaNumeric" false "예약번호를 알려주세요. (모르면 '마지막 예약'이라고 해주세요.)")"
CR_SLOT_ID="$(echo "${CR_JSON}" | ${JQ_BIN} -r .slotId)"

${AWS} lexv2-models update-intent \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
  --intent-id "${CHECK_INTENT_ID}" \
  --intent-name "CheckReservation" \
  --sample-utterances "${CHECK_UTT}" \
  --slot-priorities "[{\"priority\":1,\"slotId\":\"${CR_SLOT_ID}\"}]" \
  --fulfillment-code-hook "enabled=true" >/dev/null

# CancelReservation
CANCEL_UTT='[
  {"utterance":"예약 취소해줘"},
  {"utterance":"예약번호 {ReservationId} 취소"},
  {"utterance":"내 예약 취소"}
]'
CANCEL_INTENT_JSON="$(create_intent "CancelReservation" "예약 취소" "${CANCEL_UTT}")"
CANCEL_INTENT_ID="$(echo "${CANCEL_INTENT_JSON}" | ${JQ_BIN} -r .intentId)"
RR_JSON="$(create_slot "${CANCEL_INTENT_ID}" "ReservationId" "AMAZON.AlphaNumeric" false "취소할 예약번호를 알려주세요. (모르면 '마지막 예약'이라고 해주세요.)")"
RR_SLOT_ID="$(echo "${RR_JSON}" | ${JQ_BIN} -r .slotId)"

${AWS} lexv2-models update-intent \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
  --intent-id "${CANCEL_INTENT_ID}" \
  --intent-name "CancelReservation" \
  --sample-utterances "${CANCEL_UTT}" \
  --slot-priorities "[{\"priority\":1,\"slotId\":\"${RR_SLOT_ID}\"}]" \
  --fulfillment-code-hook "enabled=true" >/dev/null

# CourseInfo
COURSEINFO_UTT='[
  {"utterance":"{CourseName} 과정 안내해줘"},
  {"utterance":"토익 수업 정보 알려줘"},
  {"utterance":"과정 안내"}
]'
COURSEINFO_INTENT_JSON="$(create_intent "CourseInfo" "과정/수업 정보 문의" "${COURSEINFO_UTT}")"
COURSEINFO_INTENT_ID="$(echo "${COURSEINFO_INTENT_JSON}" | ${JQ_BIN} -r .intentId)"
CI_JSON="$(create_slot "${COURSEINFO_INTENT_ID}" "CourseName" "${COURSE_SLOT_TYPE_ID}" false "어떤 과정을 안내해드릴까요? (예: 토익)")"
CI_SLOT_ID="$(echo "${CI_JSON}" | ${JQ_BIN} -r .slotId)"
${AWS} lexv2-models update-intent \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
  --intent-id "${COURSEINFO_INTENT_ID}" \
  --intent-name "CourseInfo" \
  --sample-utterances "${COURSEINFO_UTT}" \
  --slot-priorities "[{\"priority\":1,\"slotId\":\"${CI_SLOT_ID}\"}]" \
  --fulfillment-code-hook "enabled=true" >/dev/null

# Help
HELP_UTT='[
  {"utterance":"도움말"},
  {"utterance":"할 수 있는 거 알려줘"},
  {"utterance":"사용 방법"}
]'
HELP_INTENT_JSON="$(create_intent "Help" "기능 안내/도움말" "${HELP_UTT}")"
HELP_INTENT_ID="$(echo "${HELP_INTENT_JSON}" | ${JQ_BIN} -r .intentId)"
${AWS} lexv2-models update-intent \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" \
  --intent-id "${HELP_INTENT_ID}" \
  --intent-name "Help" \
  --sample-utterances "${HELP_UTT}" \
  --fulfillment-code-hook "enabled=true" >/dev/null

echo "[6/9] Locale Build 시작"
${AWS} lexv2-models build-bot-locale \
  --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" >/dev/null

echo " - Build 완료까지 대기..."
while true; do
  STATUS="$(${AWS} lexv2-models describe-bot-locale --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" --query botLocaleStatus --output text)"
  echo "   * status=${STATUS}"
  if [[ "${STATUS}" == "Built" ]]; then break; fi
  if [[ "${STATUS}" == "Failed" ]]; then
    echo "Build 실패. describe-bot-locale로 failureReason 확인하세요."
    ${AWS} lexv2-models describe-bot-locale --bot-id "${BOT_ID}" --bot-version "DRAFT" --locale-id "${LOCALE_ID}" --output json | ${JQ_BIN} .
    exit 1
  fi
  sleep 10
done

echo "[7/9] Bot Version 생성"
VER_JSON="$(${AWS} lexv2-models create-bot-version --bot-id "${BOT_ID}" --bot-version-locale-specification "{\"${LOCALE_ID}\":{\"sourceBotVersion\":\"DRAFT\"}}" --output json)"
BOT_VERSION="$(echo "${VER_JSON}" | ${JQ_BIN} -r .botVersion)"
echo " - botVersion=${BOT_VERSION}"

echo "[8/9] Alias 생성: ${BOT_ALIAS_NAME}"
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
{
  "${LOCALE_ID}": { "enabled": true }
}
JSON
)"
fi

ALIAS_JSON="$(${AWS} lexv2-models create-bot-alias \
  --bot-id "${BOT_ID}" \
  --bot-alias-name "${BOT_ALIAS_NAME}" \
  --bot-version "${BOT_VERSION}" \
  --bot-alias-locale-settings "${LOCALE_SETTINGS}" \
  --output json)"

ALIAS_ID="$(echo "${ALIAS_JSON}" | ${JQ_BIN} -r .botAliasId)"
echo " - botAliasId=${ALIAS_ID}"

echo "[9/9] 결과 요약"
cat <<EOF
✅ 생성 완료
- BOT_ID=${BOT_ID}
- BOT_VERSION=${BOT_VERSION}
- BOT_ALIAS_ID=${ALIAS_ID}
- LOCALE_ID=${LOCALE_ID}

Node 서버에서 사용할 환경변수:
export AWS_REGION=${AWS_REGION}
export LEX_BOT_ID=${BOT_ID}
export LEX_BOT_ALIAS_ID=${ALIAS_ID}
export LEX_LOCALE_ID=${LOCALE_ID}

런타임 호출 테스트:
curl -s http://localhost:3000/chat -H 'Content-Type: application/json' -d '{"text":"강남점 토익 예약하고 싶어요","sessionId":"demo-user-001"}' | jq .

EOF
