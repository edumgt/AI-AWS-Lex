/**
 * Rasa REST API 클라이언트
 *
 * Rasa 서버의 REST 채널(/webhooks/rest/webhook)을 호출해 대화 응답을 받습니다.
 *
 * 필수 환경변수:
 *   RASA_BASE_URL  - Rasa 서버 URL (기본값: http://localhost:5005)
 *
 * Rasa REST 요청 형식:
 *   POST /webhooks/rest/webhook
 *   { "sender": "<sessionId>", "message": "<text>" }
 *
 * Rasa REST 응답 형식:
 *   [{ "recipient_id": "<sessionId>", "text": "<response>" }, ...]
 */

const http  = require("http");
const https = require("https");
const { URL } = require("url");

const RASA_BASE_URL = process.env.RASA_BASE_URL || "http://localhost:5005";

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

/**
 * Rasa REST 채널에 메시지를 전송하고 응답 텍스트 배열을 반환합니다.
 * @param {{ text: string, sessionId: string }} param
 * @returns {Promise<{ messages: string[], raw: object[] }>}
 */
async function sendMessage({ text, sessionId }) {
  const url  = `${RASA_BASE_URL}/webhooks/rest/webhook`;
  const body = { sender: sessionId, message: text };

  const { status, data } = await postJson(url, body);

  if (status >= 400) {
    throw new Error(`Rasa 서버 오류 (HTTP ${status})`);
  }

  const responses = Array.isArray(data) ? data : [];
  const messages  = responses
    .map((r) => r.text || r.image || r.attachment || "")
    .filter(Boolean);

  return { messages: messages.length ? messages : ["(응답 없음)"], raw: responses };
}

/**
 * Rasa 서버 상태를 확인합니다.
 * @returns {Promise<boolean>}
 */
async function ping() {
  return new Promise((resolve) => {
    const parsed = new URL(RASA_BASE_URL);
    const req = http.get(
      {
        hostname: parsed.hostname,
        port:     parsed.port || 5005,
        path:     "/",
        timeout:  3000
      },
      (res) => { res.resume(); resolve(res.statusCode < 500); }
    );
    req.on("error",   () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

module.exports = { sendMessage, ping, RASA_BASE_URL };
