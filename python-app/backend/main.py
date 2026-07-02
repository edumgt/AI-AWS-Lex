import os
import secrets
from pathlib import Path

from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from frontend_auth import issue_frontend_token, require_frontend_auth
from dialogue import handle_chat
from suggestions import get_suggestions

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
SESSION_COOKIE = "lex_session_id"

app = FastAPI(title="KF증권 챗봇 데모 (Python + vanilla JS)")


class ChatRequest(BaseModel):
    text: str
    sessionId: str | None = None
    engine: str | None = None


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/client-auth")
def client_auth(request: Request, response: Response):
    return issue_frontend_token(request, response)


@app.get("/api/engines")
def engines(_auth=Depends(require_frontend_auth)):
    return {
        "defaultEngine": "local-rule",
        "engines": [
            {"key": "local-rule", "label": "Local Rule Engine", "description": "AWS 없이 동작하는 Python 규칙 기반 상담 엔진"},
        ],
    }


@app.get("/api/suggestions")
def suggestions(slot: str, _auth=Depends(require_frontend_auth)):
    return {"slot": slot, "suggestions": get_suggestions(slot)}


@app.post("/api/chat")
def chat(payload: ChatRequest, request: Request, response: Response, _auth=Depends(require_frontend_auth)):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail={"error": "text가 비어있습니다."})

    session_id = payload.sessionId or request.cookies.get(SESSION_COOKIE) or f"web-{secrets.token_hex(6)}"
    response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax", path="/api")

    return handle_chat(text, session_id)


# ── 프런트엔드 정적 파일 서빙 (같은 오리진이라 CORS가 필요 없다) ──
app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
app.mount("/data", StaticFiles(directory=FRONTEND_DIR / "data"), name="data")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/turing.html")
def turing_page():
    return FileResponse(FRONTEND_DIR / "turing.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=True)
