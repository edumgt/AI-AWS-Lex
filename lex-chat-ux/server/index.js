"use strict";
/**
 * Express 서버 — chatbot-api Lambda 프록시
 *
 * 모든 비즈니스 로직은 AWS Lambda(chatbot-api)에 있습니다.
 * 이 서버는 HTTP ↔ Lambda SDK InvokeCommand 변환만 담당합니다.
 *
 *   Browser → POST /api/chat
 *     → Quasar dev proxy(:9000)
 *     → 이 서버(:3000)
 *     → AWS SDK InvokeCommand
 *     → chatbot-api Lambda (ap-northeast-2)
 */

const path         = require("path");
const express      = require("express");
const cookieParser = require("cookie-parser");
const { loadRuntimeEnv } = require("./runtimeEnv");

loadRuntimeEnv();

const { invokeChatApi, FUNCTION_NAME } = require("./lambdaClient");

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

async function proxyToLambda(req, res) {
  try {
    const { statusCode, body, cookies } = await invokeChatApi({
      method:  req.method,
      path:    req.path,
      query:   req.query  || {},
      body:    ["POST", "PUT", "PATCH"].includes(req.method) ? req.body : null,
      cookies: req.cookies || {},
    });

    if (Array.isArray(cookies)) {
      cookies.forEach((c) => res.setHeader("Set-Cookie", c));
    }
    res.status(statusCode).json(body);
  } catch (err) {
    console.error("[proxy] Lambda 호출 실패:", err.message);
    res.status(502).json({
      error: err.message || String(err),
      hint:  `Lambda 함수(${FUNCTION_NAME}) 호출에 실패했습니다. AWS 자격증명 및 CHAT_API_FUNCTION_NAME 확인`,
    });
  }
}

app.get( "/api/health",      proxyToLambda);
app.get( "/api/engines",     proxyToLambda);
app.get( "/api/suggestions", proxyToLambda);
app.post("/api/chat",        proxyToLambda);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[lex-chat-ux] API server listening on http://localhost:${port}`);
  console.log(`[lex-chat-ux] → Lambda: ${FUNCTION_NAME} (region: ${process.env.AWS_REGION || "ap-northeast-2"})`);
  console.log(`[lex-chat-ux] Frontend (Quasar): http://localhost:9000`);
});
