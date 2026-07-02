#!/bin/bash
# chatbot-api Lambda 빌드 & 배포 스크립트
# 사용법: bash scripts/deploy-lambda.sh [함수명]
set -e

FUNCTION_NAME="${1:-chatbot-api}"
REGION="ap-northeast-2"
DIST="$(dirname "$0")/../dist-lambda"
ROOT="$(dirname "$0")/.."

echo "=== chatbot-api Lambda 배포 ==="
echo "함수명: $FUNCTION_NAME | 리전: $REGION"

# 1. 번들링
echo "[1/4] esbuild 번들링..."
mkdir -p "$DIST"
npx --prefix "$ROOT/lex-chat-ux" esbuild "$ROOT/lex-chat-ux/server/lambda.js" \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile="$DIST/lambda.js" \
  --external:@aws-sdk/client-lex-runtime-v2 \
  --external:@aws-sdk/client-lex-models-v2 \
  --external:@aws-sdk/client-lambda \
  --log-level=warning
echo "   번들 크기: $(du -sh "$DIST/lambda.js" | cut -f1)"

# 2. ZIP
echo "[2/4] ZIP 패키징..."
cd "$DIST" && zip -q chatbot-api.zip lambda.js && cd -
echo "   ZIP 크기: $(du -sh "$DIST/chatbot-api.zip" | cut -f1)"

# 3. 코드 업데이트
echo "[3/4] Lambda 코드 업데이트..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$DIST/chatbot-api.zip" \
  --region "$REGION" \
  --query '{FunctionArn:FunctionArn,CodeSize:CodeSize,LastModified:LastModified}' \
  --output table

aws lambda wait function-updated \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION"

# 4. 환경변수 업데이트
echo "[4/4] 환경변수 업데이트..."
aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --environment "file://$(cd "$(dirname "$0")/../dist-lambda" && pwd)/env.json" \
  --region "$REGION" \
  --query '{LastModified:LastModified,State:State}' \
  --output table

echo ""
echo "=== 배포 완료 ==="
echo "Lambda ARN: $(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)"
echo ""
echo "테스트:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME --region $REGION \\"
echo "    --payload '{\"requestContext\":{\"http\":{\"method\":\"GET\",\"path\":\"/api/health\"}},\"headers\":{}}' \\"
echo "    --cli-binary-format raw-in-base64-out /tmp/out.json && cat /tmp/out.json"
