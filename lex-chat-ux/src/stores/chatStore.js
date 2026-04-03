import { defineStore } from 'pinia';
import axios from 'axios';

function normalizeEngineId(engine) {
  if (typeof engine === 'string') return engine;
  if (engine && typeof engine === 'object') {
    return engine.key || engine.id || engine.name || '';
  }
  return '';
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [],
    sessionId: '',
    summaryItems: [],
    quickReplies: [],
    selectedEngine: 'aws-lex',
    availableEngines: [],
    inputPlaceholder: '메시지를 입력하세요...',
    inputType: 'text',
    inputMode: 'message',
    slotToElicit: ''
  }),

  actions: {
    addMessage(message) {
      this.messages.push(message);
      this.saveToLocalStorage();
    },

    async loadEngines() {
      try {
        const response = await axios.get('/api/engines');
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
      } catch (error) {
        console.error('Failed to load engines:', error);
        this.availableEngines = [{ id: 'aws-lex', name: 'AWS Lex' }];
        this.selectedEngine = 'aws-lex';
      }
    },

    async sendMessage(text) {
      try {
        const engineId = normalizeEngineId(this.selectedEngine) || 'aws-lex';

        const response = await axios.post('/api/chat', {
          text,
          sessionId: this.sessionId,
          engine: engineId
        });

        const data = response.data;

        if (data.sessionId && !this.sessionId) {
          this.sessionId = data.sessionId;
        }

        if (Array.isArray(data.summary)) {
          this.summaryItems = data.summary;
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
      this.clearLocalStorage();
    },

    saveToLocalStorage() {
      const state = {
        messages: this.messages,
        sessionId: this.sessionId,
        summaryItems: this.summaryItems,
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
          this.selectedEngine = normalizeEngineId(state.selectedEngine) || 'aws-lex';
        }
      } catch (error) {
        console.error('Failed to load from localStorage:', error);
      }
    },

    clearLocalStorage() {
      localStorage.removeItem('lex_chat_ux_v3_state');
    }
  }
});
