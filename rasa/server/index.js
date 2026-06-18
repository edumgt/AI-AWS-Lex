/**
 * Rasa 챗봇 어댑터 서버 (Express)
 *
 * AWS Lex / Azure CLU / Ollama 서버와 동일한 /health, /chat 엔드포인트 구조를 제공합니다.
 * Rasa REST 채널 응답을 공통 포맷으로 변환해 반환합니다.
 *
 * 필수 환경변수:
 *   RASA_BASE_URL  - Rasa 서버 URL (기본값: http://localhost:5005)
 *
 * 실행:
 *   npm install
 *   node index.js
 *
 * Rasa 서버가 먼저 실행 중이어야 합니다:
 *   docker compose up          # rasa/docker-compose.yml 기준
 *   또는 rasa run --enable-api  # 직접 실행
 */

const express = require("express");
const { sendMessage, ping, RASA_BASE_URL } = require("./rasaClient");

const app = express();
app.use(express.json());

app.get("/health", async (req, res) => {
  const rasaUp = await ping();
  res.json({
    ok:      rasaUp,
    platform: "rasa",
    rasaUrl:  RASA_BASE_URL
  });
});

/**
 * POST /chat
 * body: { text: string, sessionId?: string }
 */
app.post("/chat", async (req, res) => {
  try {
    const text      = (req.body && req.body.text)      || "";
    const sessionId = (req.body && req.body.sessionId) || "demo-user-001";

    if (!text.trim()) {
      return res.status(400).json({ error: "text가 비어있습니다." });
    }

    const { messages, intent, state, slots, raw } = await sendMessage({ text, sessionId });

    res.json({
      messages,
      intent,
      state,
      slots,
      sessionId,
      platform: "rasa",
      raw
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "unknown error",
      hint:  `RASA_BASE_URL(${RASA_BASE_URL})에 Rasa 서버가 실행 중인지 확인하세요. (docker compose up)`
    });
  }
});

/**
 * DELETE /session/:sessionId
 * Rasa는 REST 채널에서 세션 상태를 자동 관리하므로 어댑터 레벨에서는 별도 처리 불필요.
 * 필요 시 Rasa tracker store를 직접 초기화해야 합니다.
 */
app.delete("/session/:sessionId", (req, res) => {
  res.json({ ok: true, note: "Rasa 세션은 서버 측에서 TTL로 관리됩니다." });
});

const port = process.env.PORT || 3300;
app.listen(port, () => {
  console.log(`rasa-adapter server listening on :${port}`);
  console.log(`  rasa url: ${RASA_BASE_URL}`);
});
