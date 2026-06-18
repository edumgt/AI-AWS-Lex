const express = require("express");
const http    = require("http");
const { URL } = require("url");
const { loadRuntimeEnv } = require("../shared/runtimeEnv");

loadRuntimeEnv();

const { recognizeText } = require("./lexClient");

const app = express();
app.use(express.json());

// ----------------------------------------------------------------
// 엔진 설정
// ----------------------------------------------------------------
const ENGINE_URLS = {
  "azure-clu": process.env.AZURE_SERVER_URL  || "http://localhost:3100",
  "ollama":    process.env.OLLAMA_SERVER_URL || "http://localhost:3200",
  "rasa":      process.env.RASA_SERVER_URL   || "http://localhost:3300"
};

const ENGINES = [
  { key: "aws-lex",   label: "AWS Lex V2",          description: "AWS 관리형 NLU, 인텐트/슬롯 기반" },
  { key: "azure-clu", label: "Azure CLU",            description: "Azure 관리형 NLU, 인텐트/엔티티 기반" },
  { key: "ollama",    label: "Ollama (온프렘 LLM)",  description: "로컬 LLM, 프롬프트 기반 자유 대화" },
  { key: "rasa",      label: "Rasa (ML NLU)",        description: "Python ML, 학습 데이터 기반 NLU" }
];

// ----------------------------------------------------------------
// HTTP POST 프록시 헬퍼
// ----------------------------------------------------------------
function proxyPost(targetUrl, body) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(targetUrl);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || 80,
        path:     parsed.pathname,
        method:   "POST",
        headers:  {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch (e) {
            reject(new Error(`응답 파싱 실패: ${e.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ----------------------------------------------------------------
// 라우트
// ----------------------------------------------------------------
app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * GET /engines
 * 사용 가능한 챗봇 엔진 목록을 반환합니다.
 */
app.get("/engines", (req, res) => {
  res.json({ engines: ENGINES, defaultEngine: "aws-lex" });
});

/**
 * POST /chat
 * body: { text: string, sessionId?: string, engine?: string }
 */
app.post("/chat", async (req, res) => {
  try {
    const text      = (req.body && req.body.text)      || "";
    const sessionId = (req.body && req.body.sessionId) || "demo-user-001";
    const engine    = (req.body && req.body.engine)    || "aws-lex";

    if (!text.trim()) return res.status(400).json({ error: "text가 비어있습니다." });

    // AWS Lex: SDK 직접 호출
    if (engine === "aws-lex") {
      const result   = await recognizeText({ text, sessionId });
      const messages = (result.messages || []).map((m) => m.content);
      const intent   = result.sessionState?.intent?.name  || null;
      const state    = result.sessionState?.intent?.state || null;
      const slots    = result.sessionState?.intent?.slots || null;
      return res.json({ intent, state, messages, raw: result, slots, engine: "aws-lex" });
    }

    // 다른 엔진: 해당 서버로 HTTP 프록시
    const serverUrl = ENGINE_URLS[engine];
    if (!serverUrl) {
      return res.status(400).json({ error: `알 수 없는 엔진: ${engine}` });
    }

    const { status, data } = await proxyPost(`${serverUrl}/chat`, { text, sessionId });
    res.status(status).json({ ...data, engine });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "unknown error" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`lex-lab server listening on :${port}`));
