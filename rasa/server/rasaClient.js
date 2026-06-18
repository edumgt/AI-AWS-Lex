/**
 * Rasa REST API 클라이언트
 *
 * 필수 환경변수:
 *   RASA_BASE_URL  - Rasa 서버 URL (기본값: http://localhost:5005)
 */

const http  = require("http");
const https = require("https");
const { URL } = require("url");

const RASA_BASE_URL = process.env.RASA_BASE_URL || "http://localhost:5005";

// Rasa 내부 intent 이름 → 표준 intent 이름 매핑
const INTENT_MAP = {
  book_consultation:   "BookConsultation",
  check_consultation:  "CheckConsultation",
  cancel_consultation: "CancelConsultation",
  product_info:        "ProductInfo",
  help:                "Help",
  greet:               "Greet",
  goodbye:             "Goodbye",
  affirm:              "Affirm",
  deny:                "Deny",
  out_of_scope:        "OutOfScope",
  provide_branch:      "BookConsultation",
  provide_product:     "BookConsultation",
  provide_date:        "BookConsultation",
  provide_time:        "BookConsultation",
  provide_name:        "BookConsultation",
  provide_phone:       "BookConsultation",
  nlu_fallback:        "FallbackIntent",
};

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url);
    const isHttps  = parsed.protocol === "https:";
    const payload  = JSON.stringify(body);
    const options  = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ""),
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          reject(new Error(`Rasa 응답 파싱 실패: ${e.message}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ""),
      method:   "GET",
    };
    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });
    req.on("error", () => resolve({ status: 0, data: null }));
    req.end();
  });
}

/**
 * Rasa tracker에서 intent/state/slots를 가져옵니다.
 */
async function getTracker(sessionId) {
  const url = `${RASA_BASE_URL}/conversations/${encodeURIComponent(sessionId)}/tracker`;
  const { status, data } = await getJson(url);
  if (status !== 200 || !data) return null;
  return data;
}

/**
 * Rasa REST 채널에 메시지를 전송하고 응답 + 인텐트/상태 정보를 반환합니다.
 */
async function sendMessage({ text, sessionId }) {
  const url  = `${RASA_BASE_URL}/webhooks/rest/webhook`;
  const body = { sender: sessionId, message: text };

  const { status, data } = await postJson(url, body);
  if (status >= 400) throw new Error(`Rasa 서버 오류 (HTTP ${status})`);

  const responses = Array.isArray(data) ? data : [];
  const messages  = responses
    .map((r) => r.text || r.image || r.attachment || "")
    .filter(Boolean);

  // tracker에서 intent/state 추출
  let intentName = null;
  let state      = "Fulfilled";
  let slots      = {};

  try {
    const tracker = await getTracker(sessionId);
    if (tracker) {
      const rawIntent = tracker.latest_message?.intent?.name || null;
      intentName = INTENT_MAP[rawIntent] || rawIntent;

      const activeLoop = tracker.active_loop?.name;
      if (activeLoop) {
        state = "InProgress";
      }

      // 슬롯 값 추출 (null/undefined 제외)
      const rawSlots = tracker.slots || {};
      for (const [k, v] of Object.entries(rawSlots)) {
        if (v !== null && v !== undefined && k !== "session_started_metadata" && k !== "requested_slot") {
          slots[k] = v;
        }
      }
    }
  } catch {
    // tracker 조회 실패 시 기본값 유지
  }

  return {
    messages: messages.length ? messages : ["(응답 없음)"],
    intent:   intentName,
    state,
    slots,
    raw:      responses,
  };
}

/**
 * Rasa 서버 상태를 확인합니다.
 */
async function ping() {
  return new Promise((resolve) => {
    const parsed = new URL(RASA_BASE_URL);
    const req = http.get(
      { hostname: parsed.hostname, port: parsed.port || 5005, path: "/", timeout: 3000 },
      (res) => { res.resume(); resolve(res.statusCode < 500); }
    );
    req.on("error",   () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

module.exports = { sendMessage, ping, RASA_BASE_URL };
