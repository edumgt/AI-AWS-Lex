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

const { issueFrontendToken, requireFrontendAuth } = require("./frontendAuth");
const { handler: localApiHandler } = require("./lambda");

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

async function proxyToApiHandler(req, res) {
  try {
    const lambdaStyleEvent = {
      requestContext: {
        http: {
          method: req.method,
          path: req.path
        }
      },
      path: req.path,
      queryStringParameters: req.query || {},
      headers: {
        cookie: req.headers.cookie || "",
        origin: req.headers.origin || "",
        referer: req.headers.referer || "",
        "user-agent": req.headers["user-agent"] || ""
      },
      cookies: Object.entries(req.cookies || {}).map(([key, value]) => `${key}=${value}`),
      body: ["POST", "PUT", "PATCH"].includes(req.method) ? JSON.stringify(req.body || {}) : null
    };

    const response = await localApiHandler(lambdaStyleEvent);
    const statusCode = Number(response?.statusCode || 200);
    const body = typeof response?.body === "string"
      ? JSON.parse(response.body || "{}")
      : (response?.body || {});
    const cookies = Array.isArray(response?.cookies) ? response.cookies : [];

    if (cookies.length) {
      res.append("Set-Cookie", cookies);
    }

    if (response?.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        if (String(key).toLowerCase() === "content-type") continue;
        res.setHeader(key, value);
      }
    }

    res.status(statusCode).json(body);
  } catch (err) {
    console.error("[proxy] API handler 호출 실패:", err.message);
    res.status(502).json({
      error: err.message || String(err),
      hint: "로컬 API 핸들러 실행에 실패했습니다. 엔진 설정과 AWS 자격증명을 확인하세요."
    });
  }
}

app.get( "/api/health",      proxyToApiHandler);
app.get( "/api/client-auth", issueFrontendToken);
app.get( "/api/engines",     requireFrontendAuth, proxyToApiHandler);
app.get( "/api/suggestions", requireFrontendAuth, proxyToApiHandler);
app.post("/api/chat",        requireFrontendAuth, proxyToApiHandler);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[lex-chat-ux] API server listening on http://localhost:${port}`);
  console.log(`[lex-chat-ux] Backend mode: local unified handler (region: ${process.env.AWS_REGION || "ap-northeast-2"})`);
  console.log(`[lex-chat-ux] Frontend (Quasar): http://localhost:9000`);
  if (!process.env.FRONTEND_TOKEN_SECRET) {
    console.warn("[lex-chat-ux] FRONTEND_TOKEN_SECRET 미설정: 기본값으로 동작 중입니다. .env에서 반드시 설정하세요.");
  }
});
