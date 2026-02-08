const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { nanoid } = require("nanoid");
require("dotenv").config();

const { recognizeText } = require("./lexClient");
const { formatLexResponse } = require("./lexFormatter");
const { getSuggestions } = require("./suggestions");

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

// static frontend
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/suggestions", async (req, res) => {
  try {
    const slot = (req.query?.slot || "").toString();
    const region = process.env.AWS_REGION;
    if (!region) return res.status(400).json({ error: "AWS_REGION is required" });

    const suggestions = await getSuggestions({ slot, env: process.env, region });
    res.json({ slot, suggestions });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const text = (req.body?.text || "").toString().trim();
    if (!text) return res.status(400).json({ error: "text is required" });

    // sessionId: body 우선 -> cookie -> 생성
    const provided = (req.body?.sessionId || "").toString().trim();
    const cookieSid = (req.cookies?.lex_session_id || "").toString().trim();
    const sessionId = provided || cookieSid || `web-${nanoid(10)}`;

    const raw = await recognizeText({ text, sessionId });
    const out = formatLexResponse({ raw, sessionId });

    // Quick replies 자동 주입: ElicitSlot일 때
    if (out?.ui?.mode === "elicit_slot" && out.ui.slotToElicit) {
      const slot = out.ui.slotToElicit;
      const suggestions = await getSuggestions({ slot, env: process.env, region: process.env.AWS_REGION });
      if (suggestions.length) out.ui.quickReplies = suggestions.slice(0, 8);
    }

    // cookie에 세션 저장(웹 UX 편의)
    res.cookie("lex_session_id", sessionId, { httpOnly: false, sameSite: "lax" });

    res.json(out);
  } catch (err) {
    res.status(500).json({
      error: err?.message || String(err),
      hint: "AWS_REGION / LEX_BOT_ID / LEX_BOT_ALIAS_ID / (옵션) LEX_LOCALE_ID 환경변수와 AWS 자격증명 설정을 확인하세요."
    });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[lex-chat-ux] listening on http://localhost:${port}`);
});
