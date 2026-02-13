const ENGINE_CATALOG = {
  "aws-lex": {
    key: "aws-lex",
    label: "AWS Lex (Managed)",
    deployment: "aws",
    description: "기존 Amazon Lex V2 런타임"
  },
  ollama: {
    key: "ollama",
    label: "Ollama (Docker On-Prem)",
    deployment: "onprem",
    description: "사내 서버 Docker의 Ollama REST API"
  },
  "openai-compatible": {
    key: "openai-compatible",
    label: "OpenAI-Compatible (vLLM/TGI)",
    deployment: "onprem",
    description: "사내 OpenAI 호환 엔드포인트(vLLM/TGI 등)"
  }
};

function getEnabledEngines() {
  const configured = (process.env.ENABLED_AI_ENGINES || "aws-lex,ollama,openai-compatible")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  return configured
    .map(key => ENGINE_CATALOG[key])
    .filter(Boolean);
}

async function chatWithOllama({ text }) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";

  const resp = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: text,
      stream: false
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ollama error (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  return (data?.response || "").toString().trim();
}

async function chatWithOpenAICompatible({ text }) {
  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL;
  const model = process.env.OPENAI_COMPAT_MODEL || "qwen2.5-7b-instruct";

  if (!baseUrl) {
    throw new Error("OPENAI_COMPAT_BASE_URL is required for openai-compatible engine");
  }

  const apiKey = process.env.OPENAI_COMPAT_API_KEY || "dummy";

  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "당신은 사내 업무용 챗봇입니다. 간결하고 정확하게 답하세요." },
        { role: "user", content: text }
      ],
      temperature: 0.2
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`openai-compatible error (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  return (data?.choices?.[0]?.message?.content || "").toString().trim();
}

async function chatWithOnPremEngine({ text, sessionId, engine }) {
  let answer = "";

  if (engine === "ollama") {
    answer = await chatWithOllama({ text });
  } else if (engine === "openai-compatible") {
    answer = await chatWithOpenAICompatible({ text });
  } else {
    throw new Error(`Unsupported engine: ${engine}`);
  }

  return {
    sessionId,
    engine,
    intent: "OnPremChat",
    state: "Fulfilled",
    ui: {
      mode: "message",
      prompt: answer
    },
    messages: [answer],
    slots: {},
    summary: [],
    raw: {
      provider: engine,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  getEnabledEngines,
  chatWithOnPremEngine
};
