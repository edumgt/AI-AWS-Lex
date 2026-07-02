"use strict";

const crypto = require("crypto");

const HEADER_NAME = "x-chatbot-client-key";
const COOKIE_NAME = "chatbot_client_proof";
const TOKEN_TTL_SECONDS = Math.max(300, Number(process.env.FRONTEND_TOKEN_TTL_SECONDS || 60 * 60 * 8));
const SECRET = process.env.FRONTEND_TOKEN_SECRET || "replace-me-in-env";
const ALLOWED_ORIGINS = String(process.env.FRONTEND_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function base64urlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(input) {
  const normalized = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(input || "").length / 4) * 4, "=");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function signToken(payload) {
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${encodedPayload}.${signature}`;
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ""));
  const bBuf = Buffer.from(String(b || ""));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyToken(token, expectedKind) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "missing_token" };
  }

  const [encodedPayload, providedSignature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", SECRET)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  if (!safeEqual(providedSignature, expectedSignature)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload));
  } catch (error) {
    return { ok: false, reason: "bad_payload" };
  }

  if (payload.kind !== expectedKind) {
    return { ok: false, reason: "wrong_kind" };
  }
  if (!payload.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}

function getRequestOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (origin) return origin;

  const referer = String(req.headers.referer || "").trim();
  if (!referer) return "";

  try {
    return new URL(referer).origin;
  } catch (error) {
    return "";
  }
}

function isAllowedOrigin(origin) {
  if (!ALLOWED_ORIGINS.length || !origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function hashUserAgent(req) {
  const userAgent = String(req.headers["user-agent"] || "");
  return crypto.createHash("sha256").update(userAgent).digest("hex");
}

function issueFrontendToken(req, res) {
  const origin = getRequestOrigin(req);
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      error: "Origin not allowed",
      origin
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const ua = hashUserAgent(req);

  const cookieToken = signToken({
    kind: "cookie",
    nonce,
    exp,
    ua,
    origin: origin || undefined
  });

  const headerToken = signToken({
    kind: "header",
    nonce,
    exp,
    ua,
    origin: origin || undefined
  });

  const isSecure = process.env.FRONTEND_TOKEN_SECURE === "true"
    || req.secure
    || req.headers["x-forwarded-proto"] === "https";

  res.cookie(COOKIE_NAME, cookieToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/api"
  });

  return res.json({
    clientToken: headerToken,
    expiresAt: new Date(exp * 1000).toISOString()
  });
}

function requireFrontendAuth(req, res, next) {
  const origin = getRequestOrigin(req);
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      error: "Origin not allowed",
      origin
    });
  }

  const headerToken = req.headers[HEADER_NAME];
  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerCheck = verifyToken(headerToken, "header");
  const cookieCheck = verifyToken(cookieToken, "cookie");

  if (!headerCheck.ok || !cookieCheck.ok) {
    return res.status(401).json({
      error: "Frontend authentication required",
      detail: {
        header: headerCheck.reason,
        cookie: cookieCheck.reason
      }
    });
  }

  if (headerCheck.payload.nonce !== cookieCheck.payload.nonce) {
    return res.status(401).json({
      error: "Frontend authentication required",
      detail: { mismatch: "nonce" }
    });
  }

  const requestUa = hashUserAgent(req);
  if (headerCheck.payload.ua !== requestUa || cookieCheck.payload.ua !== requestUa) {
    return res.status(401).json({
      error: "Frontend authentication required",
      detail: { mismatch: "user_agent" }
    });
  }

  if (headerCheck.payload.origin && origin && headerCheck.payload.origin !== origin) {
    return res.status(401).json({
      error: "Frontend authentication required",
      detail: { mismatch: "origin" }
    });
  }

  req.frontendAuth = {
    origin: origin || "",
    expiresAt: headerCheck.payload.exp
  };
  return next();
}

module.exports = {
  HEADER_NAME,
  COOKIE_NAME,
  issueFrontendToken,
  requireFrontendAuth
};
