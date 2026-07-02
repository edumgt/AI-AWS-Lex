// API 클라이언트: /api/client-auth 로 발급받은 토큰을 헤더에 실어 /api/* 를 호출한다.
// (Node 버전 lex-chat-ux/src/stores/chatStore.js 의 client-auth 로직을 vanilla JS로 포팅)

const CLIENT_AUTH_STORAGE_KEY = 'kf_chatbot_client_auth_v1';
const CLIENT_AUTH_HEADER = 'x-chatbot-client-key';

let clientToken = '';
let clientTokenExpiresAt = '';
let authBootstrapPromise = null;

function getStoredClientAuth() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CLIENT_AUTH_STORAGE_KEY) || '{}');
    return { token: parsed.token || '', expiresAt: parsed.expiresAt || '' };
  } catch {
    return { token: '', expiresAt: '' };
  }
}

function setStoredClientAuth(token, expiresAt) {
  sessionStorage.setItem(CLIENT_AUTH_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
}

function isClientAuthValid(expiresAt) {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) && ms > Date.now() + 60 * 1000;
}

async function ensureClientAuth(forceRefresh = false) {
  if (!forceRefresh && clientToken && isClientAuthValid(clientTokenExpiresAt)) {
    return clientToken;
  }
  if (!forceRefresh && authBootstrapPromise) {
    return authBootstrapPromise;
  }
  if (!forceRefresh) {
    const stored = getStoredClientAuth();
    if (stored.token && isClientAuthValid(stored.expiresAt)) {
      clientToken = stored.token;
      clientTokenExpiresAt = stored.expiresAt;
      return clientToken;
    }
  }

  authBootstrapPromise = fetch('/api/client-auth', { credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`client-auth HTTP ${res.status}`);
      const data = await res.json();
      if (!data.clientToken) throw new Error('client auth token was not returned');
      clientToken = data.clientToken;
      clientTokenExpiresAt = data.expiresAt;
      setStoredClientAuth(clientToken, clientTokenExpiresAt);
      return clientToken;
    })
    .catch((err) => {
      clientToken = '';
      clientTokenExpiresAt = '';
      sessionStorage.removeItem(CLIENT_AUTH_STORAGE_KEY);
      throw err;
    })
    .finally(() => {
      authBootstrapPromise = null;
    });

  return authBootstrapPromise;
}

async function apiRequest(path, options = {}) {
  const runOnce = async () => {
    await ensureClientAuth();
    const res = await fetch(path, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        [CLIENT_AUTH_HEADER]: clientToken,
        ...(options.headers || {}),
      },
    });
    return res;
  };

  let res = await runOnce();
  if (res.status === 401) {
    await ensureClientAuth(true);
    res = await runOnce();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return res.json();
}

const Api = {
  getEngines: () => apiRequest('/api/engines'),
  getSuggestions: (slot) => apiRequest(`/api/suggestions?slot=${encodeURIComponent(slot)}`),
  sendChat: (text, sessionId, engine) =>
    apiRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ text, sessionId, engine }),
    }),
};

window.Api = Api;
