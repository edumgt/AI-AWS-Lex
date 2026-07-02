"""
프런트엔드 anti-CSRF 토큰 (Node 버전 lex-chat-ux/server/frontendAuth.js 포팅).

실제 사용자 인증이 아니라, 쿠키(HttpOnly)와 헤더에 같은 nonce를 담은
double-submit 토큰 쌍을 발급/검증해 브라우저 밖에서의 API 스크래핑을 어렵게 만드는
가벼운 장치다.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

from fastapi import Request, Response, HTTPException

HEADER_NAME = "x-chatbot-client-key"
COOKIE_NAME = "chatbot_client_proof"
TOKEN_TTL_SECONDS = max(300, int(os.environ.get("FRONTEND_TOKEN_TTL_SECONDS", 60 * 60 * 8)))
SECRET = os.environ.get("FRONTEND_TOKEN_SECRET", "replace-me-in-env")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("FRONTEND_ALLOWED_ORIGINS", "").split(",") if o.strip()]


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _sign(encoded_payload: str) -> str:
    digest = hmac.new(SECRET.encode(), encoded_payload.encode(), hashlib.sha256).digest()
    return _b64url_encode(digest)


def _sign_token(payload: dict) -> str:
    encoded_payload = _b64url_encode(json.dumps(payload).encode())
    return f"{encoded_payload}.{_sign(encoded_payload)}"


def _verify_token(token: Optional[str], expected_kind: str) -> dict:
    if not token or "." not in token:
        return {"ok": False, "reason": "missing_token"}

    encoded_payload, provided_signature = token.split(".", 1)
    expected_signature = _sign(encoded_payload)
    if not hmac.compare_digest(provided_signature, expected_signature):
        return {"ok": False, "reason": "bad_signature"}

    try:
        padded = encoded_payload + "=" * (-len(encoded_payload) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        return {"ok": False, "reason": "bad_payload"}

    if payload.get("kind") != expected_kind:
        return {"ok": False, "reason": "wrong_kind"}
    if not payload.get("exp") or payload["exp"] <= time.time():
        return {"ok": False, "reason": "expired"}

    return {"ok": True, "payload": payload}


def _request_origin(request: Request) -> str:
    origin = request.headers.get("origin", "").strip()
    if origin:
        return origin
    referer = request.headers.get("referer", "").strip()
    if not referer:
        return ""
    try:
        from urllib.parse import urlsplit
        parts = urlsplit(referer)
        return f"{parts.scheme}://{parts.netloc}"
    except Exception:
        return ""


def _is_allowed_origin(origin: str) -> bool:
    if not ALLOWED_ORIGINS or not origin:
        return True
    return origin in ALLOWED_ORIGINS


def _hash_user_agent(request: Request) -> str:
    return hashlib.sha256(request.headers.get("user-agent", "").encode()).hexdigest()


def issue_frontend_token(request: Request, response: Response) -> dict:
    origin = _request_origin(request)
    if origin and not _is_allowed_origin(origin):
        raise HTTPException(status_code=403, detail={"error": "Origin not allowed", "origin": origin})

    now = int(time.time())
    exp = now + TOKEN_TTL_SECONDS
    nonce = secrets.token_hex(16)
    ua = _hash_user_agent(request)

    cookie_token = _sign_token({"kind": "cookie", "nonce": nonce, "exp": exp, "ua": ua, "origin": origin or None})
    header_token = _sign_token({"kind": "header", "nonce": nonce, "exp": exp, "ua": ua, "origin": origin or None})

    is_secure = os.environ.get("FRONTEND_TOKEN_SECURE") == "true" or request.url.scheme == "https"

    response.set_cookie(
        COOKIE_NAME,
        cookie_token,
        httponly=True,
        samesite="lax",
        secure=is_secure,
        max_age=TOKEN_TTL_SECONDS,
        path="/api",
    )

    return {"clientToken": header_token, "expiresAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(exp))}


def require_frontend_auth(request: Request) -> dict:
    origin = _request_origin(request)
    if origin and not _is_allowed_origin(origin):
        raise HTTPException(status_code=403, detail={"error": "Origin not allowed", "origin": origin})

    header_token = request.headers.get(HEADER_NAME)
    cookie_token = request.cookies.get(COOKIE_NAME)
    header_check = _verify_token(header_token, "header")
    cookie_check = _verify_token(cookie_token, "cookie")

    if not header_check["ok"] or not cookie_check["ok"]:
        raise HTTPException(status_code=401, detail={
            "error": "Frontend authentication required",
            "detail": {"header": header_check.get("reason"), "cookie": cookie_check.get("reason")},
        })

    if header_check["payload"]["nonce"] != cookie_check["payload"]["nonce"]:
        raise HTTPException(status_code=401, detail={
            "error": "Frontend authentication required", "detail": {"mismatch": "nonce"},
        })

    request_ua = _hash_user_agent(request)
    if header_check["payload"]["ua"] != request_ua or cookie_check["payload"]["ua"] != request_ua:
        raise HTTPException(status_code=401, detail={
            "error": "Frontend authentication required", "detail": {"mismatch": "user_agent"},
        })

    header_origin = header_check["payload"].get("origin")
    if header_origin and origin and header_origin != origin:
        raise HTTPException(status_code=401, detail={
            "error": "Frontend authentication required", "detail": {"mismatch": "origin"},
        })

    return {"origin": origin, "expiresAt": header_check["payload"]["exp"]}
