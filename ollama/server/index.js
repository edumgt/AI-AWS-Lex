/**
 * Ollama 온프렘 LLM 기반 챗봇 Express 서버
 *
 * AWS Lex V2 서버(server/index.js)와 동일한 /health, /chat 엔드포인트 구조를 유지합니다.
 * Ollama의 /api/chat API를 사용해 다중 턴 대화를 처리합니다.
 * 대화 이력(messages)을 세션별로 메모리에 보관합니다.
 *
 * 필수 환경변수:
 *   OLLAMA_BASE_URL  - Ollama 서버 URL (기본값: http://localhost:11434)
 *   OLLAMA_MODEL     - 사용할 모델 이름 (기본값: llama3)
 *
 * 실행:
 *   npm install
 *   node index.js
 *
 * Ollama 서버가 먼저 실행 중이어야 합니다:
 *   ollama serve          # Ollama 데몬 시작
 *   ollama pull llama3    # 모델 다운로드 (최초 1회)
 */

const express = require("express");
const { chat, ping, OLLAMA_MODEL, OLLAMA_BASE_URL } = require("./ollamaClient");

const app = express();
app.use(express.json());

// 세션별 대화 이력 저장 (role: user|assistant)
// 프로덕션 환경에서는 Redis 등 외부 저장소로 대체 권장
const sessions = new Map();

const MAX_HISTORY = 20; // 세션당 최대 보관 메시지 수 (오래된 것 제거)

app.get("/health", async (req, res) => {
  const ollamaUp = await ping();
  res.json({
    ok: ollamaUp,
    platform: "ollama",
    model: OLLAMA_MODEL,
    ollamaUrl: OLLAMA_BASE_URL
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

    if (!text.trim()) return res.status(400).json({ error: "text가 비어있습니다." });

    // 세션 대화 이력 조회
    if (!sessions.has(sessionId)) sessions.set(sessionId, []);
    const history = sessions.get(sessionId);

    // 사용자 메시지 추가
    history.push({ role: "user", content: text });

    // Ollama 호출
    const { content, raw } = await chat(history);

    // 어시스턴트 응답 이력에 추가
    history.push({ role: "assistant", content });

    // 이력 길이 제한 (오래된 메시지 제거, system 프롬프트 제외)
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }

    res.json({
      messages: [content],
      sessionId,
      model: OLLAMA_MODEL,
      historyLength: history.length,
      raw
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "unknown error",
      hint: `OLLAMA_BASE_URL(${OLLAMA_BASE_URL})에 Ollama 서버가 실행 중인지 확인하세요. (ollama serve)`
    });
  }
});

/**
 * DELETE /session/:sessionId
 * 특정 세션의 대화 이력을 초기화합니다.
 */
app.delete("/session/:sessionId", (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ ok: true, cleared: req.params.sessionId });
});

const port = process.env.PORT || 3200;
app.listen(port, () => {
  console.log(`ollama-lab server listening on :${port}`);
  console.log(`  model   : ${OLLAMA_MODEL}`);
  console.log(`  ollama  : ${OLLAMA_BASE_URL}`);
});
