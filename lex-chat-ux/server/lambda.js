"use strict";
/**
 * Lambda Function URL 핸들러
 *
 * Express server/index.js 의 라우트를 Lambda 이벤트 형식으로 그대로 구현합니다.
 * API Gateway HTTP API (payload v2) 및 Lambda Function URL 이벤트 형식을 모두 지원합니다.
 *
 * 엔드포인트:
 *   GET  /api/health
 *   GET  /api/engines
 *   GET  /api/suggestions?slot=Branch
 *   POST /api/chat   { text, sessionId?, engine? }
 */

const crypto = require("crypto");
const { recognizeText }          = require("./lexClient");
const { formatLexResponse }      = require("./lexFormatter");
const { getSuggestions }         = require("./suggestions");
const { chatWithOnPremEngine, getEnabledEngines } = require("./onpremClient");
const { runReservationFlow }     = require("./reservationFlow");

// Lambda 실행 환경에서는 .env 파일이 없으므로 환경변수는 함수 설정에서 주입됩니다.

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function genSessionId() {
  return "web-" + crypto.randomBytes(6).toString("hex");
}

function parseCookies(event) {
  // Lambda Function URL: event.cookies = ["name=value", ...]
  if (Array.isArray(event.cookies)) {
    return Object.fromEntries(
      event.cookies.map((c) => {
        const idx = c.indexOf("=");
        return idx === -1 ? [c.trim(), ""] : [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
      })
    );
  }
  // API Gateway / raw header
  const raw = event.headers?.cookie || event.headers?.Cookie || "";
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(";").map((c) => {
      const idx = c.indexOf("=");
      return idx === -1 ? [c.trim(), ""] : [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    })
  );
}

function makeSetCookie(name, value, { httpOnly = false, sameSite = "Lax" } = {}) {
  let h = `${name}=${value}; Path=/; SameSite=${sameSite}`;
  if (httpOnly) h += "; HttpOnly";
  return h;
}

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "https://www.edumgt.co.kr").split(",").map(s => s.trim());

function makeCORSHeaders(event) {
  const reqOrigin = (event?.headers?.origin || event?.headers?.Origin || "").trim();
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":      origin,
    "Access-Control-Allow-Methods":     "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type,Cookie,Authorization,x-chatbot-client-key",
    "Access-Control-Allow-Credentials": "true",
  };
}

function respond(statusCode, body, setCookies = [], event = null) {
  const headers = { "Content-Type": "application/json", ...makeCORSHeaders(event) };
  const response = {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
  // Lambda Function URL: cookies 배열 지원
  if (setCookies.length) response.cookies = setCookies;
  return response;
}

function ok(body, setCookies = [], event = null)  { return respond(200, body, setCookies, event); }
function badReq(body, event = null)               { return respond(400, body, [], event); }
function serverErr(body, event = null)            { return respond(500, body, [], event); }
function notFound(event = null)                   { return respond(404, { error: "Not Found" }, [], event); }

// ── 라우트 핸들러 ─────────────────────────────────────────────────────────────

async function handleClientAuth(event) {
  const token     = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  return ok({ clientToken: token, expiresAt }, [], event);
}

async function handleHealth(event) {
  return ok({ ok: true }, [], event);
}

async function handleEngines(event) {
  const engines = getEnabledEngines();
  const defaultEngine = (process.env.DEFAULT_AI_ENGINE || "aws-lex").trim();
  const enabledIds = new Set(engines.map((e) => e.key));
  return ok({
    defaultEngine: enabledIds.has(defaultEngine) ? defaultEngine : "aws-lex",
    engines,
  }, [], event);
}

async function handleSuggestions(qs, event) {
  const slot   = (qs?.slot || "").toString();
  const region = process.env.AWS_REGION;
  if (!region) return badReq({ error: "AWS_REGION is required" }, event);

  try {
    const suggestions = await getSuggestions({ slot, env: process.env, region });
    return ok({ slot, suggestions }, [], event);
  } catch (err) {
    return serverErr({ error: err?.message || String(err) }, event);
  }
}

async function handleChat(body, cookies, event) {
  const text = (body?.text || "").toString().trim();
  if (!text) return badReq({ error: "text is required" }, event);

  const requestedEngine = (body?.engine || process.env.DEFAULT_AI_ENGINE || "aws-lex").toString().trim();
  const enabledEngines  = getEnabledEngines();
  const enabledIds      = new Set(enabledEngines.map((e) => e.key));
  const engine          = enabledIds.has(requestedEngine) ? requestedEngine : "aws-lex";

  const provided  = (body?.sessionId || "").toString().trim();
  const cookieSid = (cookies?.lex_session_id || "").toString().trim();
  const sessionId = provided || cookieSid || genSessionId();

  const sessionCookie = makeSetCookie("lex_session_id", sessionId, { httpOnly: false, sameSite: "Lax" });

  try {
    // 온프렘 엔진 (rasa / azure-clu / ollama / openai-compatible)
    if (engine !== "aws-lex") {
      const out = await chatWithOnPremEngine({ text, sessionId, engine });
      return ok(out, [sessionCookie], event);
    }

    // 로컬 예약 플로우 (ENABLE_LOCAL_RESERVATION_FLOW=true 시)
    const localFlow = (process.env.ENABLE_LOCAL_RESERVATION_FLOW || "").toLowerCase() === "true";
    if (localFlow) {
      const reservationOut = await runReservationFlow({
        text,
        sessionId,
        getSuggestions: (slot) =>
          getSuggestions({ slot, env: process.env, region: process.env.AWS_REGION }),
      });
      if (reservationOut) return ok({ ...reservationOut, engine }, [sessionCookie], event);
    }

    // AWS Lex V2
    const raw = await recognizeText({ text, sessionId });
    const out = formatLexResponse({ raw, sessionId });

    // ElicitSlot 시 quickReplies 자동 주입
    if (out?.ui?.mode === "elicit_slot" && out.ui.slotToElicit) {
      const suggestions = await getSuggestions({
        slot:   out.ui.slotToElicit,
        env:    process.env,
        region: process.env.AWS_REGION,
      });
      if (suggestions.length) out.ui.quickReplies = suggestions.slice(0, 8);
    }

    return ok({ ...out, engine }, [sessionCookie], event);
  } catch (err) {
    return serverErr({
      error: err?.message || String(err),
      hint:  "AWS_REGION / LEX_BOT_ID / LEX_BOT_ALIAS_ID / LEX_LOCALE_ID 환경변수와 AWS 자격증명 설정을 확인하세요.",
    }, event);
  }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // Lambda Function URL payload v2 / API Gateway HTTP API
  const method = (
    event.requestContext?.http?.method ||
    event.httpMethod ||
    "GET"
  ).toUpperCase();

  const path = (
    event.requestContext?.http?.path ||
    event.path ||
    "/"
  ).replace(/\/$/, "") || "/";

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: makeCORSHeaders(event), body: "" };
  }

  const cookies = parseCookies(event);
  const qs      = event.queryStringParameters || {};

  let body = null;
  if (event.body) {
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      body = {};
    }
  }

  if (method === "GET"  && path === "/api/client-auth")  return handleClientAuth(event);
  if (method === "GET"  && path === "/api/health")       return handleHealth(event);
  if (method === "GET"  && path === "/api/engines")      return handleEngines(event);
  if (method === "GET"  && path === "/api/suggestions")  return handleSuggestions(qs, event);
  if (method === "POST" && path === "/api/chat")         return handleChat(body, cookies, event);

  return notFound(event);
};
