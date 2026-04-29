/**
 * Ollama 온프렘 LLM 클라이언트
 *
 * Ollama REST API(http://localhost:11434)를 사용해 대화 기록을 유지하면서
 * 사용자 메시지를 LLM으로 처리합니다.
 *
 * 필수 환경변수:
 *   OLLAMA_BASE_URL  - Ollama 서버 URL (기본값: http://localhost:11434)
 *   OLLAMA_MODEL     - 사용할 모델 이름 (기본값: llama3)
 *
 * 온프렘 환경에서 Ollama 모델 설치:
 *   ollama pull llama3
 *   ollama pull mistral
 *   ollama pull gemma3        # 한국어 지원 강화
 *   ollama pull qwen2.5       # 다국어 지원
 *   ollama pull exaone3.5     # LG AI Research 한국어 특화 모델
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || "llama3";

// 학원 예약 챗봇용 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 어학원 예약/상담 전문 AI 어시스턴트입니다.
다음 기능을 처리할 수 있습니다:
1. 수강 예약 (지점, 과정, 날짜, 시간, 이름, 연락처 수집)
2. 예약 조회 (예약번호 또는 이름으로)
3. 예약 취소
4. 과정 안내 (토익, 오픽, 영어회화, 일본어, 자격증)
5. 기타 도움말

지점 목록: 강남점, 홍대점, 잠실점, 분당점, 인천점
과정 목록: 토익, 오픽, 영어회화, 일본어, 자격증

항상 한국어로 답변하세요. 필요한 정보가 부족하면 단계적으로 질문하세요.
예약 완료 시 "R-" 로 시작하는 예약번호를 생성해 안내하세요.
응답은 간결하게 1~3문장 이내로 유지하세요.`;

/**
 * JSON body를 HTTP POST로 전송하는 범용 헬퍼 (외부 의존성 없음)
 */
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + (parsed.search || ""),
      method: "POST",
      headers: { "Content-Type": "application/json" }
    };
    const payload = JSON.stringify(body);
    const transport = isHttps ? https : http;
    const req = transport.request(options, res => {
      const chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error(`Ollama 응답 파싱 실패: ${e.message}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Ollama /api/chat 를 호출해 대화 응답을 받습니다.
 * @param {Array<{role:string, content:string}>} messages - 전체 대화 이력
 * @returns {Promise<{ content: string, raw: object }>}
 */
async function chat(messages) {
  const url = `${OLLAMA_BASE_URL}/api/chat`;
  const body = {
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
    ],
    stream: false
  };

  const res = await postJson(url, body);
  const content = res?.message?.content || "(응답 없음)";
  return { content, raw: res };
}

/**
 * Ollama 서버 상태를 확인합니다.
 * @returns {Promise<boolean>}
 */
async function ping() {
  return new Promise(resolve => {
    const parsed = new URL(OLLAMA_BASE_URL);
    const req = http.get(
      { hostname: parsed.hostname, port: parsed.port || 11434, path: "/", timeout: 3000 },
      res => { res.resume(); resolve(res.statusCode < 500); }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

module.exports = { chat, ping, OLLAMA_MODEL, OLLAMA_BASE_URL };
