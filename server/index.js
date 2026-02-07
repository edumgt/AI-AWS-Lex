const express = require("express");
const { recognizeText } = require("./lexClient");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * POST /chat
 * body: { text: string, sessionId?: string }
 */
app.post("/chat", async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";
    const sessionId = (req.body && req.body.sessionId) || "demo-user-001";

    if (!text.trim()) return res.status(400).json({ error: "text가 비어있습니다." });

    const result = await recognizeText({ text, sessionId });

    // 응답을 단순화해서 프론트/테스트가 보기 좋게 리턴
    const messages = (result.messages || []).map(m => m.content);
    const intent = result.sessionState?.intent?.name || null;
    const state = result.sessionState?.intent?.state || null;
    const slots = result.sessionState?.intent?.slots || null;

    res.json({ intent, state, messages, raw: result, slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "unknown error" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`lex-lab server listening on :${port}`));
