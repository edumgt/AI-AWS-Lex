/**
 * Azure CLU 기반 챗봇 Express 서버
 *
 * AWS Lex V2 서버(server/index.js)와 동일한 /health, /chat 엔드포인트 구조를 유지합니다.
 * CLU는 Lex와 달리 자체 대화 흐름(slot elicitation)이 없으므로
 * 인텐트 인식 후 fulfillment 처리를 서버 내 핸들러에서 수행합니다.
 *
 * 필수 환경변수:
 *   AZURE_LANGUAGE_ENDPOINT
 *   AZURE_LANGUAGE_KEY
 *   AZURE_CLU_PROJECT
 *   AZURE_CLU_DEPLOYMENT
 */

const express = require("express");
const { analyzeText } = require("./azureClient");
const { handleIntent } = require("../functions/fulfillment");

const app = express();
app.use(express.json());

// 세션 상태를 메모리에 보관 (프로덕션에서는 Redis/Azure Cache 등으로 대체)
const sessions = new Map();

app.get("/health", (req, res) => res.json({ ok: true, platform: "azure-clu" }));

/**
 * POST /chat
 * body: { text: string, sessionId?: string }
 */
app.post("/chat", async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";
    const sessionId = (req.body && req.body.sessionId) || "demo-user-001";

    if (!text.trim()) return res.status(400).json({ error: "text가 비어있습니다." });

    // CLU로 인텐트/엔티티 분석
    const cluResult = await analyzeText({ text, sessionId });

    // 세션 상태 조회 및 업데이트
    const sessionState = sessions.get(sessionId) || {};
    const { reply, newState } = await handleIntent(cluResult, sessionState, text);
    sessions.set(sessionId, newState);

    res.json({
      intent: cluResult.intent,
      score: cluResult.score,
      entities: cluResult.entities,
      messages: [reply],
      sessionState: newState,
      raw: cluResult.raw
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "unknown error" });
  }
});

const port = process.env.PORT || 3100;
app.listen(port, () => console.log(`azure-clu server listening on :${port}`));
