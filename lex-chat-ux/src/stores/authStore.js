import { defineStore } from 'pinia';

const AUTH_STORAGE_KEY = 'lex_chat_ux_cognito_session_v1';
const PKCE_STORAGE_KEY = 'lex_chat_ux_cognito_pkce_v1';

function getEnv(name, fallback = '') {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
}

function isEnabled() {
  return getEnv('VITE_COGNITO_ENABLED', 'false') === 'true'
    && !!getEnv('VITE_COGNITO_DOMAIN')
    && !!getEnv('VITE_COGNITO_CLIENT_ID');
}

function getRedirectUri() {
  const configured = getEnv('VITE_COGNITO_REDIRECT_URI');
  if (configured) return configured;
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

function getLogoutRedirectUri() {
  const configured = getEnv('VITE_COGNITO_LOGOUT_REDIRECT_URI');
  if (configured) return configured;
  return getRedirectUri();
}

function getCognitoConfig() {
  const domain = getEnv('VITE_COGNITO_DOMAIN').replace(/\/$/, '');
  return {
    enabled: isEnabled(),
    domain,
    clientId: getEnv('VITE_COGNITO_CLIENT_ID'),
    scope: getEnv('VITE_COGNITO_SCOPE', 'openid profile email chatbot-api/chat'),
    redirectUri: getRedirectUri(),
    logoutRedirectUri: getLogoutRedirectUri(),
    authorizeEndpoint: domain ? `${domain}/oauth2/authorize` : '',
    tokenEndpoint: domain ? `${domain}/oauth2/token` : '',
    logoutEndpoint: domain ? `${domain}/logout` : ''
  };
}

function decodeBase64Url(input) {
  const normalized = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(input || '').length / 4) * 4, '=');

  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(normalized);
  }
  return Buffer.from(normalized, 'base64').toString('binary');
}

function parseJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return {};
    const json = decodeURIComponent(
      Array.from(decodeBase64Url(payload))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(json);
  } catch (error) {
    return {};
  }
}

function getStoredSession() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function setStoredSession(session) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

function getStoredPkce() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(sessionStorage.getItem(PKCE_STORAGE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function setStoredPkce(payload) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(payload));
}

function clearStoredPkce() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PKCE_STORAGE_KEY);
}

function toBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const base64 = typeof window !== 'undefined' && typeof window.btoa === 'function'
    ? window.btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function createPkcePair() {
  const verifier = randomString(64);
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  const challenge = toBase64Url(new Uint8Array(digest));
  return { verifier, challenge };
}

function getSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function removeAuthParamsFromUrl() {
  if (typeof window === 'undefined') return;
  const cleaned = `${window.location.pathname}${window.location.hash || ''}`;
  window.history.replaceState({}, document.title, cleaned);
}

function isSessionValid(session) {
  return !!session?.accessToken
    && Number.isFinite(Number(session?.expiresAt))
    && Number(session.expiresAt) > Date.now() + 60 * 1000;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    enabled: isEnabled(),
    initialized: false,
    authenticating: false,
    authenticated: false,
    accessToken: '',
    idToken: '',
    refreshToken: '',
    expiresAt: 0,
    user: null,
    error: '',
    initPromise: null,
    refreshPromise: null
  }),

  getters: {
    displayName(state) {
      return state.user?.name || state.user?.email || state.user?.username || '';
    }
  },

  actions: {
    hydrateSession(session) {
      this.accessToken = session?.accessToken || '';
      this.idToken = session?.idToken || '';
      this.refreshToken = session?.refreshToken || '';
      this.expiresAt = Number(session?.expiresAt || 0);
      this.user = this.idToken ? this.extractUser(this.idToken) : null;
      this.authenticated = isSessionValid(session);
    },

    extractUser(idToken) {
      const claims = parseJwtPayload(idToken);
      return {
        email: claims.email || '',
        name: claims.name || claims['cognito:username'] || claims.email || '',
        username: claims['cognito:username'] || claims.email || ''
      };
    },

    clearSession() {
      this.accessToken = '';
      this.idToken = '';
      this.refreshToken = '';
      this.expiresAt = 0;
      this.user = null;
      this.authenticated = false;
      this.error = '';
      clearStoredSession();
      clearStoredPkce();
    },

    persistSession(tokenResponse) {
      const expiresIn = Number(tokenResponse.expires_in || 3600);
      const session = {
        accessToken: tokenResponse.access_token || '',
        idToken: tokenResponse.id_token || this.idToken || '',
        refreshToken: tokenResponse.refresh_token || this.refreshToken || '',
        expiresAt: Date.now() + expiresIn * 1000
      };

      this.hydrateSession(session);
      setStoredSession(session);
      this.error = '';
      return session;
    },

    async initialize() {
      if (!this.enabled) {
        this.initialized = true;
        this.authenticated = false;
        return;
      }

      if (this.initialized) return;
      if (this.initPromise) return this.initPromise;

      this.initPromise = (async () => {
        this.authenticating = true;
        try {
          const stored = getStoredSession();
          if (stored) {
            this.hydrateSession(stored);
          }

          const params = getSearchParams();
          if (params.get('code')) {
            await this.completeLogin(params);
          } else if (!isSessionValid(getStoredSession()) && this.refreshToken) {
            await this.refreshSession();
          }
        } catch (error) {
          this.error = error.message || String(error);
          this.clearSession();
        } finally {
          this.initialized = true;
          this.authenticating = false;
          this.initPromise = null;
        }
      })();

      return this.initPromise;
    },

    async beginLogin() {
      const config = getCognitoConfig();
      if (!config.enabled) {
        throw new Error('Cognito auth is not configured');
      }

      const state = randomString(24);
      const { verifier, challenge } = await createPkcePair();
      setStoredPkce({ state, verifier });

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scope,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state
      });

      window.location.assign(`${config.authorizeEndpoint}?${params.toString()}`);
    },

    async completeLogin(params = getSearchParams()) {
      const config = getCognitoConfig();
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      if (error) {
        removeAuthParamsFromUrl();
        throw new Error(errorDescription || error);
      }

      const pkce = getStoredPkce();
      if (!code || !pkce?.verifier || !pkce?.state) {
        removeAuthParamsFromUrl();
        throw new Error('Missing Cognito authorization code or PKCE verifier');
      }
      if (state !== pkce.state) {
        removeAuthParamsFromUrl();
        clearStoredPkce();
        throw new Error('Cognito state validation failed');
      }

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code,
        code_verifier: pkce.verifier,
        redirect_uri: config.redirectUri
      });

      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      const json = await response.json().catch(() => ({}));
      removeAuthParamsFromUrl();
      clearStoredPkce();

      if (!response.ok) {
        throw new Error(json.error_description || json.error || `Cognito token exchange failed (${response.status})`);
      }

      this.persistSession(json);
    },

    async refreshSession() {
      const config = getCognitoConfig();
      if (!this.refreshToken) {
        this.clearSession();
        throw new Error('No Cognito refresh token available');
      }
      if (this.refreshPromise) return this.refreshPromise;

      this.refreshPromise = (async () => {
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: config.clientId,
          refresh_token: this.refreshToken
        });

        const response = await fetch(config.tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        const json = await response.json().catch(() => ({}));

        if (!response.ok) {
          this.clearSession();
          throw new Error(json.error_description || json.error || `Cognito refresh failed (${response.status})`);
        }

        this.persistSession({
          ...json,
          refresh_token: this.refreshToken
        });
      })().finally(() => {
        this.refreshPromise = null;
      });

      return this.refreshPromise;
    },

    async ensureValidSession() {
      if (!this.enabled) return null;
      await this.initialize();

      const current = getStoredSession();
      if (isSessionValid(current)) {
        this.hydrateSession(current);
        return current;
      }

      if (this.refreshToken) {
        await this.refreshSession();
        const refreshed = getStoredSession();
        if (isSessionValid(refreshed)) {
          this.hydrateSession(refreshed);
          return refreshed;
        }
      }

      throw new Error('No active Cognito session');
    },

    async getAuthorizationHeader() {
      if (!this.enabled) return {};
      const session = await this.ensureValidSession();
      return session?.accessToken
        ? { Authorization: `Bearer ${session.accessToken}` }
        : {};
    },

    async logout() {
      const config = getCognitoConfig();
      this.clearSession();

      if (!config.enabled || !config.logoutEndpoint) return;

      const params = new URLSearchParams({
        client_id: config.clientId,
        logout_uri: config.logoutRedirectUri
      });

      window.location.assign(`${config.logoutEndpoint}?${params.toString()}`);
    }
  }
});
