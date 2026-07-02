#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${1:-chatbot-api}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/home/ubuntu/chatbot-app/lex-chat-ux/.env.production}"

command -v aws >/dev/null 2>&1 || { echo "aws CLI 가 필요합니다."; exit 1; }

get_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue | [0]" \
    --output text
}

API_BASE_URL="$(get_output ApiGatewayUrl)"
COGNITO_CLIENT_ID="$(get_output CognitoUserPoolClientId)"
COGNITO_DOMAIN="$(get_output CognitoHostedUiBaseUrl)"
COGNITO_SCOPE="$(get_output CognitoApiScope)"

mkdir -p "$(dirname "$WEBAPP_ENV_FILE")"

cat > "$WEBAPP_ENV_FILE" <<EOF
VITE_API_BASE_URL=${API_BASE_URL}
VITE_COGNITO_ENABLED=true
VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}
VITE_COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
VITE_COGNITO_SCOPE=openid profile email ${COGNITO_SCOPE}
VITE_TRANSCRIBE_API_BASE_URL=${VITE_TRANSCRIBE_API_BASE_URL:-}
EOF

echo "웹앱 Cognito 환경파일을 갱신했습니다: ${WEBAPP_ENV_FILE}"
cat "$WEBAPP_ENV_FILE"
