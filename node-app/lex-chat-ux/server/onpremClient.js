const http = require("http");

const ENGINE_CATALOG = {
  "aws-lex": {
    key: "aws-lex",
    label: "AWS Lex V2",
    deployment: "aws",
    description: "AWS 관리형 NLU — 인텐트/슬롯 기반"
  },
  "azure-clu": {
    key: "azure-clu",
    label: "Azure CLU",
    deployment: "azure",
    description: "Azure 관리형 NLU — 인텐트/엔티티 기반 (포트 3100)"
  },
  ollama: {
    key: "ollama",
    label: "Ollama (온프렘 LLM)",
    deployment: "onprem",
    description: "로컬 LLM 런타임 — 프롬프트 기반 자유 대화 (포트 3200)"
  },
  rasa: {
    key: "rasa",
    label: "Rasa (ML NLU)",
    deployment: "onprem",
    description: "Python ML 분류기 — 학습 데이터 기반 NLU (포트 3300)"
  },
  "openai-compatible": {
    key: "openai-compatible",
    label: "OpenAI-Compatible (vLLM/TGI)",
    deployment: "onprem",
    description: "사내 OpenAI 호환 엔드포인트 (vLLM/TGI 등)"
  }
};

// 서브 서버 URL 매핑 (어댑터 서버를 통해 통신)
const ENGINE_SERVER_URLS = {
  "azure-clu": process.env.AZURE_SERVER_URL  || "http://localhost:3100",
  ollama:       process.env.OLLAMA_SERVER_URL || "http://localhost:3200",
  rasa:         process.env.RASA_SERVER_URL   || "http://localhost:3300"
};

function getEnabledEngines() {
  const configured = (
    process.env.ENABLED_AI_ENGINES ||
    "aws-lex,azure-clu,ollama,rasa,openai-compatible"
  )
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  return configured.map((key) => ENGINE_CATALOG[key]).filter(Boolean);
}

// ----------------------------------------------------------------
// HTTP POST 헬퍼 (서브 서버 프록시용)
// ----------------------------------------------------------------
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const { URL } = require("url");
    const parsed  = new URL(url);
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
// 엔진별 채팅 구현
// ----------------------------------------------------------------
async function chatWithOllama({ text }) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model   = process.env.OLLAMA_MODEL    || "llama3.1:8b";

  const resp = await fetch(`${baseUrl}/api/generate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ model, prompt: text, stream: false })
  });

  if (!resp.ok) {
    throw new Error(`ollama error (${resp.status}): ${await resp.text()}`);
  }

  const data = await resp.json();
  return (data?.response || "").toString().trim();
}

async function chatWithOpenAICompatible({ text }) {
  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL;
  const model   = process.env.OPENAI_COMPAT_MODEL || "qwen2.5-7b-instruct";
  const apiKey  = process.env.OPENAI_COMPAT_API_KEY || "dummy";

  if (!baseUrl) {
    throw new Error("OPENAI_COMPAT_BASE_URL is required for openai-compatible engine");
  }

  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify({
      model,
      messages: [
        { role: "system", content: "당신은 사내 업무용 챗봇입니다. 간결하고 정확하게 답하세요." },
        { role: "user",   content: text }
      ],
      temperature: 0.2
    })
  });

  if (!resp.ok) {
    throw new Error(`openai-compatible error (${resp.status}): ${await resp.text()}`);
  }

  const data = await resp.json();
  return (data?.choices?.[0]?.message?.content || "").toString().trim();
}

/**
 * 서브 서버(어댑터)로 요청을 프록시합니다.
 * azure-clu(3100), ollama-server(3200), rasa(3300) 등이 대상입니다.
 */
async function chatViaAdapterServer({ text, sessionId, engine }) {
  const serverUrl = ENGINE_SERVER_URLS[engine];
  if (!serverUrl) throw new Error(`No adapter URL configured for engine: ${engine}`);

  const { status, data } = await postJson(`${serverUrl}/chat`, { text, sessionId });

  if (status >= 400) {
    throw new Error(data?.error || `어댑터 서버 오류 (HTTP ${status})`);
  }

  // 어댑터 응답을 통합 포맷으로 래핑
  const messages = Array.isArray(data.messages) ? data.messages : [data.messages || "(응답 없음)"];
  const answer   = messages[0] || "";

  return {
    sessionId,
    engine,
    intent: data.intent || null,
    state:  data.state  || null,
    ui: {
      mode:   "message",
      prompt: answer
    },
    messages,
    slots:   data.slots   || {},
    summary: data.summary || [],
    raw:     data
  };
}

// ----------------------------------------------------------------
// 공개 인터페이스
// ----------------------------------------------------------------
async function chatWithOnPremEngine({ text, sessionId, engine }) {
  // 어댑터 서버를 통해 프록시하는 엔진
  if (engine === "azure-clu" || engine === "rasa") {
    return chatViaAdapterServer({ text, sessionId, engine });
  }

  // Ollama: 어댑터 서버 경유 또는 직접 호출 모두 지원
  if (engine === "ollama") {
    // OLLAMA_SERVER_URL이 설정돼 있으면 어댑터 서버 사용
    if (process.env.OLLAMA_SERVER_URL) {
      return chatViaAdapterServer({ text, sessionId, engine });
    }
    const answer = await chatWithOllama({ text });
    return buildResponse({ sessionId, engine, answer });
  }

  if (engine === "openai-compatible") {
    const answer = await chatWithOpenAICompatible({ text });
    return buildResponse({ sessionId, engine, answer });
  }

  throw new Error(`Unsupported engine: ${engine}`);
}

function buildResponse({ sessionId, engine, answer }) {
  return {
    sessionId,
    engine,
    intent: "OnPremChat",
    state:  "Fulfilled",
    ui:     { mode: "message", prompt: answer },
    messages: [answer],
    slots:    {},
    summary:  [],
    raw:      { provider: engine, timestamp: new Date().toISOString() }
  };
}

module.exports = { getEnabledEngines, chatWithOnPremEngine };
