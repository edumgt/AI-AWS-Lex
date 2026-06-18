"use strict";
/**
 * AWS Lambda SDK 호출 클라이언트
 * chatbot-api Lambda 함수를 InvokeCommand 로 호출합니다.
 */

const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const region       = process.env.AWS_REGION              || "ap-northeast-2";
const FUNCTION_NAME = process.env.CHAT_API_FUNCTION_NAME || "chatbot-api";

const lambdaClient = new LambdaClient({ region });

async function invokeChatApi({ method, path, query, body, cookies }) {
  const event = {
    requestContext: { http: { method: method.toUpperCase(), path } },
    queryStringParameters: query   || {},
    body:    body    ? JSON.stringify(body) : null,
    cookies: Object.entries(cookies || {}).map(([k, v]) => `${k}=${v}`),
    headers: {},
  };

  const cmd    = new InvokeCommand({
    FunctionName:   FUNCTION_NAME,
    InvocationType: "RequestResponse",
    Payload:        JSON.stringify(event),
  });

  const res     = await lambdaClient.send(cmd);
  const result  = JSON.parse(Buffer.from(res.Payload).toString("utf8"));

  return {
    statusCode: result.statusCode || 200,
    headers:    result.headers    || {},
    body:       typeof result.body === "string" ? JSON.parse(result.body) : (result.body ?? {}),
    cookies:    result.cookies    || [],
  };
}

module.exports = { invokeChatApi, FUNCTION_NAME };
