import { defineStore } from 'pinia';
import axios from 'axios';
import { useAuthStore } from './authStore';
import { pinia } from './pinia';

// Quasar dev proxy(/api → Express:3000 → Lambda SDK) 경로 사용
// VITE_API_BASE_URL 설정 시 Lambda URL 직접 호출 (계정 SCP 허용 환경)
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const COGNITO_ENABLED = import.meta.env.VITE_COGNITO_ENABLED === 'true';
const CLIENT_AUTH_STORAGE_KEY = 'lex_chat_ux_client_auth_v1';
const CLIENT_AUTH_HEADER = 'x-chatbot-client-key';

const apiGet = (path, params, config = {}) =>
  axios.get(`${API_BASE}${path}`, {
    params,
    withCredentials: !COGNITO_ENABLED,
    ...config,
    headers: {
      ...(config.headers || {})
    }
  });

const apiPost = (path, data, config = {}) =>
  axios.post(`${API_BASE}${path}`, data, {
    withCredentials: !COGNITO_ENABLED,
    ...config,
    headers: {
      ...(config.headers || {})
    }
  });

function normalizeEngineId(engine) {
  if (typeof engine === 'string') return engine;
  if (engine && typeof engine === 'object') {
    return engine.key || engine.id || engine.name || '';
  }
  return '';
}

function getStoredClientAuth() {
  if (typeof window === 'undefined') {
    return { token: '', expiresAt: '' };
  }

  try {
    const parsed = JSON.parse(sessionStorage.getItem(CLIENT_AUTH_STORAGE_KEY) || '{}');
    return {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : ''
    };
  } catch (error) {
    return { token: '', expiresAt: '' };
  }
}

function setStoredClientAuth(token, expiresAt) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(CLIENT_AUTH_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
}

function clearStoredClientAuth() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(CLIENT_AUTH_STORAGE_KEY);
}

function isClientAuthValid(expiresAt) {
  if (!expiresAt) return false;
  const expiresMs = Date.parse(expiresAt);
  return Number.isFinite(expiresMs) && expiresMs > Date.now() + 60 * 1000;
}

async function buildRequestHeaders() {
  if (COGNITO_ENABLED) {
    const authStore = useAuthStore(pinia);
    return authStore.getAuthorizationHeader();
  }

  const chatStore = useChatStore(pinia);
  await chatStore.ensureClientAuth();
  return chatStore.getClientAuthHeaders();
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [],
    sessionId: '',
    summaryItems: [],
    lastConsultation: null,
    quickReplies: [],
    selectedEngine: 'aws-lex',
    availableEngines: [],
    inputPlaceholder: '메시지를 입력하세요...',
    inputType: 'text',
    inputMode: 'message',
    slotToElicit: '',
    clientToken: '',
    clientTokenExpiresAt: '',
    authBootstrapPromise: null
  }),

  actions: {
    addMessage(message) {
      this.messages.push(message);
      this.saveToLocalStorage();
    },

    async loadEngines() {
      const runRequest = async () => {
        const response = await apiGet('/api/engines', undefined, {
          headers: await buildRequestHeaders()
        });
        const data = response.data;

        this.availableEngines = (Array.isArray(data.engines) ? data.engines : [])
          .map((engine) => {
            if (typeof engine === 'string') {
              return {
                id: engine,
                name: engine.toUpperCase().replace(/-/g, ' ')
              };
            }

            return {
              id: engine.key || engine.id || 'unknown',
              name: engine.label || engine.name || String(engine.key || engine.id || 'UNKNOWN')
            };
          })
          .filter((engine) => engine.id && engine.name);

        if (!this.availableEngines.length) {
          this.availableEngines = [{ id: 'aws-lex', name: 'AWS Lex' }];
        }

        const candidateEngine = normalizeEngineId(this.selectedEngine) || normalizeEngineId(data.defaultEngine) || 'aws-lex';
        const isKnown = this.availableEngines.some((engine) => engine.id === candidateEngine);
        this.selectedEngine = isKnown ? candidateEngine : 'aws-lex';
      };

      try {
        await runRequest();
      } catch (error) {
        if (error?.response?.status === 401 && !COGNITO_ENABLED) {
          await this.ensureClientAuth(true);
          await runRequest();
          return;
        }
        console.error('Failed to load engines:', error);
        this.availableEngines = [{ id: 'aws-lex', name: 'AWS Lex' }];
        this.selectedEngine = 'aws-lex';
      }
    },

    async sendMessage(text) {
      const runRequest = async () => {
        const engineId = normalizeEngineId(this.selectedEngine) || 'aws-lex';

        const response = await apiPost('/api/chat', {
          text,
          sessionId: this.sessionId,
          engine: engineId
        }, {
          headers: await buildRequestHeaders()
        });

        return response.data;
      };

      try {
        let data;
        try {
          data = await runRequest();
        } catch (error) {
          if (error?.response?.status !== 401 || COGNITO_ENABLED) throw error;
          await this.ensureClientAuth(true);
          data = await runRequest();
        }

        if (data.sessionId && !this.sessionId) {
          this.sessionId = data.sessionId;
        }

        if (Array.isArray(data.summary)) {
          this.summaryItems = data.summary;
        }

        if (data.intent === 'BookConsultation' && data.state === 'Fulfilled' && Array.isArray(data.summary)) {
          this.lastConsultation = {
            createdAt: new Date().toISOString(),
            fields: data.summary.reduce((acc, item) => {
              if (item?.key) acc[item.key] = item.value || '';
              return acc;
            }, {}),
            message: Array.isArray(data.messages) ? data.messages[0] || '' : ''
          };
        }

        // Update input UI based on response
        this.updateInputUI(data.ui);

        // Update quick replies
        if (data.ui?.mode === 'elicit_slot' || data.ui?.mode === 'confirm_intent') {
          this.quickReplies = data.ui.quickReplies || [];
        } else {
          this.quickReplies = [];
        }

        this.saveToLocalStorage();
        
        return data;
      } catch (error) {
        console.error('Chat error:', error);
        throw error;
      }
    },

    getClientAuthHeaders() {
      return this.clientToken
        ? { [CLIENT_AUTH_HEADER]: this.clientToken }
        : {};
    },

    async ensureClientAuth(forceRefresh = false) {
      if (COGNITO_ENABLED) return '';

      if (!forceRefresh && this.clientToken && isClientAuthValid(this.clientTokenExpiresAt)) {
        return this.clientToken;
      }

      if (!forceRefresh && this.authBootstrapPromise) {
        return this.authBootstrapPromise;
      }

      if (!forceRefresh) {
        const stored = getStoredClientAuth();
        if (stored.token && isClientAuthValid(stored.expiresAt)) {
          this.clientToken = stored.token;
          this.clientTokenExpiresAt = stored.expiresAt;
          return stored.token;
        }
      }

      const promise = apiGet('/api/client-auth').then((response) => {
        const token = response.data?.clientToken || '';
        const expiresAt = response.data?.expiresAt || '';
        if (!token) {
          throw new Error('client auth token was not returned');
        }
        this.clientToken = token;
        this.clientTokenExpiresAt = expiresAt;
        setStoredClientAuth(token, expiresAt);
        return token;
      }).catch((error) => {
        this.clientToken = '';
        this.clientTokenExpiresAt = '';
        clearStoredClientAuth();
        throw error;
      }).finally(() => {
        this.authBootstrapPromise = null;
      });

      this.authBootstrapPromise = promise;
      return promise;
    },

    updateInputUI(ui) {
      if (!ui) return;

      const mode = ui.mode || 'message';
      const slot = ui.slotToElicit || '';

      this.inputMode = mode;
      this.slotToElicit = slot;
      this.inputType = 'text';
      this.inputPlaceholder = ui.placeholder || '메시지를 입력하세요...';

      if (mode === 'elicit_slot') {
        if (slot === 'PhoneNumber') {
          this.inputType = 'tel';
          this.inputPlaceholder = ui.placeholder || '010-1234-5678';
        } else if (slot === 'Time') {
          this.inputType = 'time';
          this.inputPlaceholder = ui.placeholder || '19:30';
        } else if (slot === 'Date') {
          this.inputType = 'date';
          this.inputPlaceholder = ui.placeholder || '2026-02-10';
        }
      } else if (mode === 'confirm_intent') {
        this.inputPlaceholder = '네/아니요로 답하거나 내용을 수정해 주세요';
      }
    },

    setEngine(engineId) {
      this.selectedEngine = normalizeEngineId(engineId) || 'aws-lex';
      this.saveToLocalStorage();
    },

    resetSession() {
      this.messages = [];
      this.sessionId = '';
      this.summaryItems = [];
      this.quickReplies = [];
      this.inputPlaceholder = '메시지를 입력하세요...';
      this.inputType = 'text';
      this.inputMode = 'message';
      this.slotToElicit = '';
      this.clientToken = '';
      this.clientTokenExpiresAt = '';
      this.clearLocalStorage();
      clearStoredClientAuth();
    },

    saveToLocalStorage() {
      const state = {
        messages: this.messages,
        sessionId: this.sessionId,
        summaryItems: this.summaryItems,
        lastConsultation: this.lastConsultation,
        selectedEngine: this.selectedEngine,
        updatedAt: Date.now()
      };
      localStorage.setItem('lex_chat_ux_v3_state', JSON.stringify(state));
    },

    loadFromLocalStorage() {
      try {
        const stored = localStorage.getItem('lex_chat_ux_v3_state');
        if (stored) {
          const state = JSON.parse(stored);
          this.messages = state.messages || [];
          this.sessionId = state.sessionId || '';
          this.summaryItems = state.summaryItems || [];
          this.lastConsultation = state.lastConsultation || null;
          this.selectedEngine = normalizeEngineId(state.selectedEngine) || 'aws-lex';
        }

        const clientAuth = getStoredClientAuth();
        this.clientToken = clientAuth.token;
        this.clientTokenExpiresAt = clientAuth.expiresAt;
      } catch (error) {
        console.error('Failed to load from localStorage:', error);
      }
    },

    clearLocalStorage() {
      localStorage.removeItem('lex_chat_ux_v3_state');
    }
  }
});
