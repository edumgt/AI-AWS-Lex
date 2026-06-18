<template>
  <Teleport to="body">
    <Transition name="chat-pop">
      <div v-if="dialogOpen" class="chat-popup">

        <!-- ── HEADER ── -->
        <div class="cp-header">
          <div class="cp-header-left">
            <div class="cp-avatar">
              <q-icon name="smart_toy" size="20px" color="white" />
            </div>
            <div>
              <div class="cp-title">KF증권 AI 상담</div>
              <div class="cp-subtitle">
                <span class="cp-dot"></span>온라인
              </div>
            </div>
          </div>
          <div class="cp-header-right">
            <button class="cp-icon-btn" title="엔진 설정">
              <q-icon name="settings" size="18px" />
              <q-menu>
                <q-list style="min-width: 200px">
                  <q-item-label header>엔진 선택</q-item-label>
                  <q-item
                    v-for="engine in availableEngines"
                    :key="engine.id"
                    clickable v-close-popup
                    @click="selectEngine(engine.id)"
                  >
                    <q-item-section>{{ engine.name }}</q-item-section>
                    <q-item-section side>
                      <q-icon v-if="selectedEngine === engine.id" name="check" color="primary" />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </button>
            <button class="cp-icon-btn" title="새 대화" @click="startNewSession">
              <q-icon name="refresh" size="18px" />
            </button>
            <button class="cp-icon-btn cp-close" title="닫기" @click="dialogOpen = false">
              <q-icon name="close" size="18px" />
            </button>
          </div>
        </div>

        <!-- ── SUMMARY ── -->
        <div v-if="summaryItems.length > 0" class="cp-summary">
          <div class="cp-summary-title">예약 정보</div>
          <div class="cp-chips">
            <span v-for="item in summaryItems" :key="item.label" class="cp-chip">
              <strong>{{ item.label }}:</strong> {{ item.value || '—' }}
            </span>
          </div>
        </div>

        <!-- ── MESSAGES ── -->
        <div class="cp-messages" ref="msgContainer">
          <div class="cp-msg-list">
            <div
              v-for="(msg, i) in messages" :key="i"
              class="cp-msg-row" :class="msg.role === 'user' ? 'user' : 'bot'"
            >
              <template v-if="msg.role !== 'user'">
                <div class="cp-bot-avatar">
                  <q-icon name="smart_toy" size="14px" color="primary" />
                </div>
                <div class="cp-bot-bubble">
                  <div class="cp-bot-name">KF증권 AI</div>
                  <div class="cp-bot-text">{{ msg.text }}</div>
                  <div v-if="msg.meta" class="cp-meta">{{ msg.meta }}</div>
                </div>
              </template>
              <template v-else>
                <div class="cp-user-bubble">{{ msg.text }}</div>
              </template>
            </div>

            <!-- Typing -->
            <div v-if="isTyping" class="cp-msg-row bot">
              <div class="cp-bot-avatar">
                <q-icon name="smart_toy" size="14px" color="primary" />
              </div>
              <div class="cp-bot-bubble">
                <div class="cp-typing">
                  <span class="td"></span><span class="td"></span><span class="td"></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── QUICK: branch picker ── -->
        <div v-if="slotToElicit === 'Branch'" class="cp-quick">
          <CampusMapPicker compact :selected-branch="selectedBranch" @select="sendQuickReply" />
        </div>

        <!-- ── QUICK: chips ── -->
        <div v-else-if="quickReplies.length > 0" class="cp-quick">
          <button
            v-for="reply in quickReplies" :key="reply"
            class="cp-qchip"
            @click="sendQuickReply(reply)"
          >{{ reply }}</button>
        </div>

        <!-- ── INPUT ── -->
        <div class="cp-input-area">
          <div class="cp-input-bar" :class="{ focused: focused }">
            <input
              v-model="userInput"
              :placeholder="inputPlaceholder || '메시지를 입력하세요...'"
              :type="inputType || 'text'"
              class="cp-input"
              @keyup.enter="sendMessage"
              @focus="focused = true"
              @blur="focused = false"
              ref="inputRef"
            />
            <button
              class="cp-send"
              :disabled="!userInput.trim() || isTyping"
              @click="sendMessage"
            >
              <q-icon :name="isTyping ? 'hourglass_empty' : 'arrow_upward'" size="18px" />
            </button>
          </div>
          <div class="cp-footer-text">KF증권 AI · 투자 결과는 고객 본인의 책임</div>
        </div>

      </div>
    </Transition>

    <!-- Mobile backdrop -->
    <Transition name="fade-back">
      <div v-if="dialogOpen" class="cp-backdrop" @click="dialogOpen = false"></div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useChatStore } from '../stores/chatStore';
import { pinia } from '../stores/pinia';
import CampusMapPicker from './CampusMapPicker.vue';

const $q = useQuasar();
const chatStore = useChatStore(pinia);

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue']);

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const msgContainer = ref(null);
const inputRef = ref(null);
const userInput = ref('');
const isTyping = ref(false);
const focused = ref(false);

const messages = computed(() => chatStore.messages);
const sessionId = computed(() => chatStore.sessionId);
const summaryItems = computed(() => chatStore.summaryItems);
const quickReplies = computed(() => chatStore.quickReplies);
const selectedEngine = computed(() => chatStore.selectedEngine);
const availableEngines = computed(() => chatStore.availableEngines);
const inputPlaceholder = computed(() => chatStore.inputPlaceholder);
const inputType = computed(() => chatStore.inputType);
const slotToElicit = computed(() => chatStore.slotToElicit);
const selectedBranch = computed(() =>
  summaryItems.value.find(i => i.key === 'Branch')?.value || ''
);

const GREETINGS = {
  'aws-lex':   '안녕하세요! KF증권 AI 투자상담입니다.\n예) "여의도지점 ETF 투자상담 예약하고 싶어요"',
  'azure-clu': '안녕하세요! KF증권 AI 투자상담입니다.\n예) "여의도지점 ETF 투자상담 예약하고 싶어요"',
  ollama:      '안녕하세요! KF증권 AI 투자상담입니다.\n무엇이든 편하게 물어보세요.',
  rasa:        '안녕하세요! 글로벌어학원 상담 챗봇입니다.\n예) "강남점 토익 상담 예약하고 싶어요"',
};

const scrollToBottom = () => {
  nextTick(() => {
    if (msgContainer.value) {
      msgContainer.value.scrollTop = msgContainer.value.scrollHeight;
    }
  });
};

watch(messages, scrollToBottom, { deep: true });

watch(dialogOpen, (open) => {
  if (!open) return;
  chatStore.loadEngines();
  if (messages.value.length === 0) {
    addBotMessage(GREETINGS[selectedEngine.value] || GREETINGS['aws-lex']);
  }
  nextTick(() => {
    scrollToBottom();
    inputRef.value?.focus();
  });
  const branch = localStorage.getItem('lex_chat_ux_branch_prefill');
  if (branch) {
    localStorage.removeItem('lex_chat_ux_branch_prefill');
    nextTick(() => sendQuickReply(branch));
  }
});

onMounted(() => chatStore.loadFromLocalStorage());

const addBotMessage = (text, meta = '') => {
  chatStore.addMessage({ role: 'bot', text, meta, ts: Date.now() });
};

const sendMessage = async () => {
  const text = userInput.value.trim();
  if (!text || isTyping.value) return;

  chatStore.addMessage({ role: 'user', text, ts: Date.now() });
  userInput.value = '';
  isTyping.value = true;

  try {
    const response = await chatStore.sendMessage(text);
    isTyping.value = false;
    if (response.error) {
      addBotMessage(`에러: ${response.error}`, response.hint || '');
      return;
    }
    const msgs = response.messages?.length ? response.messages : [response.ui?.prompt].filter(Boolean);
    const meta = [response.engine, response.intent, response.state].filter(Boolean).join(' · ');
    msgs.forEach(m => addBotMessage(m, meta));
  } catch (err) {
    isTyping.value = false;
    addBotMessage('에러가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
};

const sendQuickReply = (reply) => {
  userInput.value = reply;
  sendMessage();
};

const selectEngine = (id) => {
  chatStore.setEngine(id);
  $q.notify({ message: `엔진 변경: ${id}`, color: 'primary', position: 'top', timeout: 1200 });
};

const startNewSession = () => {
  if (messages.value.length === 0) return;
  $q.dialog({
    title: '새 대화 시작',
    message: '현재 대화가 초기화됩니다. 계속하시겠습니까?',
    cancel: true
  }).onOk(() => {
    chatStore.resetSession();
    addBotMessage(GREETINGS[selectedEngine.value] || GREETINGS['aws-lex']);
  });
};
</script>

<style scoped>
/* ── Popup card ── */
.chat-popup {
  position: fixed;
  bottom: 90px;
  right: 24px;
  width: 380px;
  height: 600px;
  max-height: calc(100vh - 110px);
  z-index: 9000;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.cp-header {
  background: linear-gradient(135deg, #1652f0, #7c3aed);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.cp-header-left { display: flex; align-items: center; gap: 10px; }
.cp-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cp-title    { color: white; font-size: 14px; font-weight: 700; }
.cp-subtitle { display: flex; align-items: center; gap: 4px; color: rgba(255,255,255,0.75); font-size: 11px; }
.cp-dot      { width: 7px; height: 7px; border-radius: 50%; background: #0ecb81; display: inline-block; }
.cp-header-right { display: flex; align-items: center; gap: 4px; }
.cp-icon-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(255,255,255,0.15); border: none;
  color: white; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.15s;
}
.cp-icon-btn:hover  { background: rgba(255,255,255,0.25); }
.cp-close:hover     { background: rgba(255,100,100,0.3); }

/* ── Summary ── */
.cp-summary {
  background: #eef3ff;
  padding: 10px 16px;
  border-bottom: 1px solid #dce5ff;
  flex-shrink: 0;
}
.cp-summary-title { font-size: 11px; font-weight: 700; color: #1652f0; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
.cp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cp-chip  { font-size: 12px; background: white; color: #374151; border: 1px solid #dce5ff; border-radius: 20px; padding: 3px 10px; }

/* ── Messages ── */
.cp-messages {
  flex: 1;
  overflow-y: auto;
  background: #f8fafc;
  padding: 16px;
  scroll-behavior: smooth;
}
.cp-msg-list { display: flex; flex-direction: column; gap: 16px; }
.cp-msg-row { display: flex; align-items: flex-start; gap: 8px; }
.cp-msg-row.user { justify-content: flex-end; }

.cp-bot-avatar {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: #eef3ff;
  display: flex; align-items: center; justify-content: center;
  margin-top: 2px;
}
.cp-bot-bubble  { max-width: 80%; }
.cp-bot-name    { font-size: 11px; font-weight: 700; color: #1652f0; margin-bottom: 4px; }
.cp-bot-text {
  background: white; color: #1e293b;
  border-radius: 14px 14px 14px 2px;
  padding: 10px 14px; font-size: 14px; line-height: 1.6;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  white-space: pre-wrap; word-break: break-word;
}
.cp-meta { font-size: 10px; color: #94a3b8; margin-top: 4px; font-family: monospace; }

.cp-user-bubble {
  background: #1652f0; color: white;
  border-radius: 14px 14px 2px 14px;
  padding: 10px 14px; font-size: 14px; line-height: 1.55;
  max-width: 80%; word-break: break-word;
}

/* Typing */
.cp-typing { display: flex; gap: 4px; padding: 4px 0; }
.td {
  width: 7px; height: 7px; border-radius: 50%;
  background: #94a3b8; animation: tdBounce 1.2s infinite;
}
.td:nth-child(2) { animation-delay: 0.15s; }
.td:nth-child(3) { animation-delay: 0.3s; }
@keyframes tdBounce {
  0%,60%,100% { transform: translateY(0); opacity: 0.6; }
  30%         { transform: translateY(-6px); opacity: 1; }
}

/* ── Quick replies ── */
.cp-quick {
  padding: 10px 14px;
  background: white;
  border-top: 1px solid #f1f5f9;
  display: flex; flex-wrap: wrap; gap: 6px;
  flex-shrink: 0;
}
.cp-qchip {
  background: #eef3ff; color: #1652f0;
  border: 1.5px solid #c7d7ff; border-radius: 20px;
  padding: 5px 12px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.cp-qchip:hover { background: #1652f0; color: white; }

/* ── Input ── */
.cp-input-area {
  background: white;
  padding: 12px 14px 10px;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.cp-input-bar {
  display: flex; align-items: center; gap: 8px;
  background: #f1f5f9; border-radius: 24px;
  padding: 6px 6px 6px 16px;
  border: 1.5px solid transparent;
  transition: border-color 0.18s;
}
.cp-input-bar.focused { border-color: #1652f0; background: #fff; }
.cp-input {
  flex: 1; border: none; background: transparent;
  font-size: 14px; color: #1e293b; outline: none;
  font-family: inherit;
}
.cp-input::placeholder { color: #94a3b8; }
.cp-send {
  width: 34px; height: 34px; border-radius: 50%;
  background: #1652f0; border: none; color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.cp-send:hover:not(:disabled) { background: #1244d1; }
.cp-send:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; }
.cp-footer-text { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 6px; }

/* ── Backdrop (mobile) ── */
.cp-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 8999;
  display: none;
}

/* ── Transitions ── */
.chat-pop-enter-active { transition: all 0.28s cubic-bezier(0.34, 1.2, 0.64, 1); }
.chat-pop-leave-active { transition: all 0.2s ease; }
.chat-pop-enter-from  { opacity: 0; transform: translateY(16px) scale(0.95); }
.chat-pop-leave-to    { opacity: 0; transform: translateY(10px) scale(0.97); }

.fade-back-enter-active,
.fade-back-leave-active { transition: opacity 0.2s; }
.fade-back-enter-from,
.fade-back-leave-to     { opacity: 0; }

/* ── Mobile ── */
@media (max-width: 640px) {
  .cp-backdrop { display: block; }
  .chat-popup {
    bottom: 0; right: 0; left: 0;
    width: 100%; height: 80vh;
    max-height: 80vh;
    border-radius: 24px 24px 0 0;
  }
  .chat-pop-enter-from,
  .chat-pop-leave-to { transform: translateY(100%); opacity: 1; }
}
</style>
