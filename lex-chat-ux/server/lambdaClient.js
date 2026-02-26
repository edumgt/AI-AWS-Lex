const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 필요합니다.`);
  return v;
}

function getClient() {
  const region = requireEnv("AWS_REGION");
  return new LambdaClient({ region });
}

async function invokeReservationFulfillment({ text, sessionId, extra = {} }) {
  const client = getClient();

  const functionName =
    process.env.LAMBDA_FUNCTION_NAME ||
    "arn:aws:lambda:ap-northeast-2:086015456585:function:LexReservationFulfillment";

  // Lambda로 넘길 payload
  const payload = {
    text,
    sessionId,
    ...extra
  };

  const cmd = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "RequestResponse", // 동기 호출
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  const res = await client.send(cmd);

  // 함수 에러 처리
  if (res.FunctionError) {
    const errText = res.Payload
      ? Buffer.from(res.Payload).toString("utf8")
      : "Lambda function error";
    throw new Error(`Lambda 호출 실패: ${errText}`);
  }

  // Payload 파싱
  const rawText = res.Payload
    ? Buffer.from(res.Payload).toString("utf8")
    : "{}";

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = { raw: rawText };
  }

  // API Gateway 프록시 형식 대응
  if (parsed && typeof parsed === "object" && "statusCode" in parsed) {
    let body = parsed.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // 문자열 그대로 사용
      }
    }

    if (parsed.statusCode >= 400) {
      throw new Error(
        typeof body === "string" ? body : JSON.stringify(body)
      );
    }

    return body;
  }

  return parsed;
}

module.exports = { invokeReservationFulfillment };