#!/usr/bin/env bash
set -euo pipefail

# ==========================================
# Config
# ==========================================
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
RUNTIME="${RUNTIME:-python3.12}"
ROLE_NAME="${ROLE_NAME:-hello-world-lambda-role}"
FUNCTION_NAME="${FUNCTION_NAME:-hello-world-json-get}"
API_NAME="${API_NAME:-hello-world-api}"
RESOURCE_PATH="${RESOURCE_PATH:-hello}"
HANDLER="${HANDLER:-lambda_function.lambda_handler}"

WORKDIR="$(pwd)/.hello_api_build"
ZIP_FILE="${WORKDIR}/function.zip"
PY_FILE="${WORKDIR}/lambda_function.py"
TRUST_FILE="${WORKDIR}/trust-policy.json"

mkdir -p "$WORKDIR"

# ==========================================
# Pre-check
# ==========================================
command -v aws >/dev/null 2>&1 || { echo "aws CLI 가 필요합니다."; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "zip 명령이 필요합니다."; exit 1; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "AWS_ACCOUNT_ID=$ACCOUNT_ID"
echo "AWS_REGION=$AWS_REGION"

# ==========================================
# 1) IAM Role for Lambda
# ==========================================
cat > "$TRUST_FILE" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

ROLE_ARN=""
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "[IAM] existing role found: $ROLE_NAME"
  ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"
else
  echo "[IAM] creating role: $ROLE_NAME"
  ROLE_ARN="$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://$TRUST_FILE" \
    --query 'Role.Arn' \
    --output text)"

  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

  echo "[IAM] waiting for role propagation..."
  sleep 10
fi

echo "ROLE_ARN=$ROLE_ARN"

# ==========================================
# 2) Create Lambda source
# ==========================================
cat > "$PY_FILE" <<'PY'
import json

def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps({
            "message": "hello world",
            "method": event.get("httpMethod"),
            "path": event.get("path")
        }, ensure_ascii=False)
    }
PY

rm -f "$ZIP_FILE"
(
  cd "$WORKDIR"
  zip -q function.zip lambda_function.py
)

# ==========================================
# 3) Create or update Lambda function
# ==========================================
FUNCTION_ARN=""
if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "[Lambda] existing function found: $FUNCTION_NAME"
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_FILE" >/dev/null

  FUNCTION_ARN="$(aws lambda get-function \
    --function-name "$FUNCTION_NAME" \
    --query 'Configuration.FunctionArn' \
    --output text)"
else
  echo "[Lambda] creating function: $FUNCTION_NAME"
  FUNCTION_ARN="$(aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --role "$ROLE_ARN" \
    --handler "$HANDLER" \
    --zip-file "fileb://$ZIP_FILE" \
    --timeout 10 \
    --memory-size 128 \
    --query 'FunctionArn' \
    --output text)"
fi

echo "FUNCTION_ARN=$FUNCTION_ARN"

# ==========================================
# 4) Create REST API
# ==========================================
API_ID=""
ROOT_RESOURCE_ID=""

EXISTING_API_ID="$(aws apigateway get-rest-apis \
  --query "items[?name=='$API_NAME'].id | [0]" \
  --output text)"

if [[ "$EXISTING_API_ID" != "None" && -n "$EXISTING_API_ID" ]]; then
  API_ID="$EXISTING_API_ID"
  echo "[APIGW] existing API found: $API_NAME ($API_ID)"
else
  echo "[APIGW] creating REST API: $API_NAME"
  API_ID="$(aws apigateway create-rest-api \
    --name "$API_NAME" \
    --endpoint-configuration types=REGIONAL \
    --query 'id' \
    --output text)"
fi

ROOT_RESOURCE_ID="$(aws apigateway get-resources \
  --rest-api-id "$API_ID" \
  --query "items[?path=='/'].id | [0]" \
  --output text)"

echo "API_ID=$API_ID"
echo "ROOT_RESOURCE_ID=$ROOT_RESOURCE_ID"

# ==========================================
# 5) Create /hello resource if missing
# ==========================================
RESOURCE_ID="$(aws apigateway get-resources \
  --rest-api-id "$API_ID" \
  --query "items[?path=='/${RESOURCE_PATH}'].id | [0]" \
  --output text)"

if [[ "$RESOURCE_ID" == "None" || -z "$RESOURCE_ID" ]]; then
  echo "[APIGW] creating resource: /$RESOURCE_PATH"
  RESOURCE_ID="$(aws apigateway create-resource \
    --rest-api-id "$API_ID" \
    --parent-id "$ROOT_RESOURCE_ID" \
    --path-part "$RESOURCE_PATH" \
    --query 'id' \
    --output text)"
else
  echo "[APIGW] existing resource found: /$RESOURCE_PATH"
fi

echo "RESOURCE_ID=$RESOURCE_ID"

# ==========================================
# 6) Create GET method if missing
# ==========================================
if aws apigateway get-method \
  --rest-api-id "$API_ID" \
  --resource-id "$RESOURCE_ID" \
  --http-method GET >/dev/null 2>&1; then
  echo "[APIGW] GET method already exists"
else
  echo "[APIGW] creating GET method"
  aws apigateway put-method \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method GET \
    --authorization-type "NONE" >/dev/null
fi

# ==========================================
# 7) Put Lambda proxy integration
#    NOTE: Lambda integration method must be POST
# ==========================================
LAMBDA_URI="arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/${FUNCTION_ARN}/invocations"

echo "[APIGW] configuring Lambda proxy integration"
aws apigateway put-integration \
  --rest-api-id "$API_ID" \
  --resource-id "$RESOURCE_ID" \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "$LAMBDA_URI" >/dev/null

# ==========================================
# 8) Grant API Gateway permission to invoke Lambda
# ==========================================
STATEMENT_ID="${FUNCTION_NAME}-${API_ID}-get-${RESOURCE_PATH}"

SOURCE_ARN="arn:aws:execute-api:${AWS_REGION}:${ACCOUNT_ID}:${API_ID}/*/GET/${RESOURCE_PATH}"

if aws lambda get-policy --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  if aws lambda get-policy --function-name "$FUNCTION_NAME" \
      --query "Policy" --output text | grep -q "$STATEMENT_ID"; then
    echo "[Lambda] permission already exists: $STATEMENT_ID"
  else
    echo "[Lambda] adding invoke permission"
    aws lambda add-permission \
      --function-name "$FUNCTION_NAME" \
      --statement-id "$STATEMENT_ID" \
      --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "$SOURCE_ARN" >/dev/null
  fi
else
  echo "[Lambda] adding invoke permission"
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "$STATEMENT_ID" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "$SOURCE_ARN" >/dev/null
fi

# ==========================================
# 9) Deploy to dev and prod stages
#    create-deployment with stage-name creates or updates that stage
# ==========================================
echo "[APIGW] deploying to stage: dev"
aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name dev \
  --stage-description "Development stage" \
  --description "Deployment to dev" >/dev/null

echo "[APIGW] deploying to stage: prod"
aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name prod \
  --stage-description "Production stage" \
  --description "Deployment to prod" >/dev/null

# ==========================================
# 10) Output
# ==========================================
DEV_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/dev/${RESOURCE_PATH}"
PROD_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/prod/${RESOURCE_PATH}"

echo
echo "=========================================="
echo "배포 완료"
echo "=========================================="
echo "Lambda Function : $FUNCTION_NAME"
echo "REST API ID     : $API_ID"
echo "Resource Path   : /$RESOURCE_PATH"
echo "DEV URL         : $DEV_URL"
echo "PROD URL        : $PROD_URL"
echo
echo "테스트:"
echo "curl \"$DEV_URL\""
echo "curl \"$PROD_URL\""