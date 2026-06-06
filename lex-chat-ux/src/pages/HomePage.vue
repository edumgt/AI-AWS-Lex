<template>
  <q-layout view="hHh LpR fFf">

    <!-- ══════════════ HEADER ══════════════ -->
    <q-header flat class="gem-header">
      <q-toolbar>
        <q-btn flat round dense icon="menu"
               class="gem-icon-btn"
               @click="leftOpen = !leftOpen" />

        <div class="gem-logo q-ml-xs">
          <q-icon name="school" size="20px" color="primary" />
          <span class="gem-logo-text">학원 AI 상담</span>
        </div>

        <q-space />

        <q-chip
          v-if="currentEngineLabel && $q.screen.gt.sm"
          dense clickable
          color="blue-1" text-color="primary"
          class="q-mr-xs gem-engine-chip"
          @click="rightOpen = !rightOpen"
        >
          <q-icon name="smart_toy" size="14px" class="q-mr-xs" />
          {{ currentEngineLabel }}
        </q-chip>

        <q-btn flat round dense icon="info_outline"
               class="gem-icon-btn"
               @click="rightOpen = !rightOpen">
          <q-tooltip anchor="bottom middle" self="top middle">예약 현황 &amp; 설정</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>


    <!-- ══════════════ LEFT DRAWER ══════════════ -->
    <q-drawer
      v-model="leftOpen"
      show-if-above
      :width="256"
      :breakpoint="768"
      class="gem-left-drawer"
    >
      <div class="q-px-md q-pt-md q-pb-xs">
        <q-btn flat align="left" icon="edit_square" label="새 대화"
               class="new-chat-btn full-width"
               @click="confirmNewChat" />
      </div>

      <q-separator class="gem-sep q-my-xs" />

      <q-list padding class="q-pb-xs">
        <q-item-label header class="gem-drawer-label">메뉴</q-item-label>
        <q-item
          v-for="nav in navItems" :key="nav.label"
          clickable v-ripple
          class="gem-nav-item q-mb-xs"
          @click="handleNavClick(nav)"
        >
          <q-item-section avatar>
            <q-icon :name="nav.icon" size="20px" class="gem-icon-color" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="gem-nav-label">{{ nav.label }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>

      <q-separator class="gem-sep q-my-xs" />

      <div class="q-px-md q-py-sm">
        <q-item-label class="gem-drawer-label q-mb-sm">AI 엔진</q-item-label>
        <q-select
          v-model="engineModel"
          :options="engineOptions"
          dense outlined
          emit-value map-options
          class="gem-engine-select"
          @update:model-value="onEngineChange"
        />
      </div>

      <q-separator class="gem-sep q-my-xs" />

      <div v-if="firstUserMessage" class="q-px-md q-py-sm">
        <q-item-label class="gem-drawer-label q-mb-sm">이전 대화</q-item-label>
        <div class="recent-chat-item" @click="scrollToTop">
          <q-icon name="chat_bubble_outline" size="16px" class="q-mr-sm gem-icon-color" />
          <span class="text-sm gem-text-2">{{ firstUserMessage }}</span>
        </div>
      </div>
    </q-drawer>


    <!-- ══════════════ RIGHT DRAWER ══════════════ -->
    <q-drawer
      side="right"
      v-model="rightOpen"
      :width="300"
      :breakpoint="1200"
      overlay
      class="gem-right-drawer"
    >
      <div class="q-pa-md">

        <template v-if="summaryItems.length > 0">
          <div class="gem-panel-title q-mb-sm">예약 진행 현황</div>
          <div class="summary-grid">
            <div v-for="item in summaryItems" :key="item.key" class="summary-row">
              <span class="summary-key">{{ item.label }}</span>
              <q-chip dense size="sm"
                      :color="item.value ? 'blue-1' : 'grey-2'"
                      :text-color="item.value ? 'primary' : 'grey-6'">
                {{ item.value || '—' }}
              </q-chip>
            </div>
          </div>
          <q-separator class="gem-sep q-my-md" />
        </template>

        <div class="gem-panel-title q-mb-sm">캠퍼스 선택</div>
        <CampusMapPicker
          compact
          :selected-branch="selectedBranch"
          @select="handleCampusSelect"
        />

        <q-separator class="gem-sep q-my-md" />

        <div class="gem-panel-title q-mb-xs">세션 ID</div>
        <div class="session-id-text">{{ sessionId || '(없음)' }}</div>
        <q-btn flat dense icon="refresh" label="새 세션" size="sm"
               class="q-mt-sm" color="grey-7"
               @click="confirmNewChat" />
      </div>
    </q-drawer>


    <!-- ══════════════ MAIN CHAT PAGE ══════════════ -->
    <q-page-container>
      <q-page class="flex column gem-chat-page" style="height: 0">

        <q-scroll-area
          class="col"
          ref="scrollAreaRef"
          :thumb-style="{ right: '4px', width: '4px', background: '#dadce0', borderRadius: '4px', opacity: '0.8' }"
        >
          <!-- Welcome state -->
          <div v-if="messages.length === 0" class="welcome-wrapper">
            <div class="q-mb-lg">
              <q-icon name="auto_awesome" size="52px" color="primary" />
            </div>
            <h1 class="welcome-title">무엇을 도와드릴까요?</h1>
            <p class="welcome-sub">학원 수강 상담, 예약, 정보를 자유롭게 물어보세요</p>
            <div class="suggestion-row q-mt-xl">
              <q-btn
                v-for="s in suggestions" :key="s"
                outline rounded :label="s"
                class="suggestion-chip q-ma-xs"
                @click="sendSuggestion(s)"
              />
            </div>
          </div>

          <!-- Messages -->
          <div v-else class="messages-list q-pa-lg">
            <div
              v-for="(msg, idx) in messages" :key="idx"
              :class="['msg-row', msg.role === 'user' ? 'user-row' : 'bot-row']"
            >
              <template v-if="msg.role !== 'user'">
                <div class="bot-avatar-circle">
                  <q-icon name="auto_awesome" size="16px" color="primary" />
                </div>
                <div class="bot-body">
                  <div class="bot-name-label">학원 AI</div>
                  <div class="bot-text whitespace-pre-wrap">{{ msg.text }}</div>
                  <div v-if="msg.meta" class="msg-meta">{{ msg.meta }}</div>
                </div>
              </template>
              <template v-else>
                <div class="user-bubble">{{ msg.text }}</div>
              </template>
            </div>

            <!-- Typing indicator -->
            <div v-if="isTyping" class="msg-row bot-row">
              <div class="bot-avatar-circle">
                <q-icon name="auto_awesome" size="16px" color="primary" />
              </div>
              <div class="bot-body">
                <div class="bot-name-label">학원 AI</div>
                <div class="typing-dots">
                  <span class="tdot"></span>
                  <span class="tdot"></span>
                  <span class="tdot"></span>
                </div>
              </div>
            </div>
          </div>
        </q-scroll-area>


        <!-- Quick reply: campus picker -->
        <div v-if="slotToElicit === 'Branch'" class="quick-bar">
          <CampusMapPicker compact :selected-branch="selectedBranch" @select="sendQuickReply" />
        </div>

        <!-- Quick reply: chips -->
        <div v-else-if="quickReplies.length > 0" class="quick-bar">
          <q-btn
            v-for="reply in quickReplies" :key="reply"
            outline rounded dense :label="reply" size="sm"
            class="q-ma-xs" color="primary"
            @click="sendQuickReply(reply)"
          />
        </div>


        <!-- Input bar -->
        <div class="gem-input-area">
          <div class="gem-input-bar" :class="{ focused: inputFocused }">
            <q-input
              v-model="userInput"
              :placeholder="inputPlaceholder"
              :type="inputType"
              borderless
              class="gem-input flex-1"
              autofocus
              @keyup.enter.prevent="sendMessage"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
            >
              <template v-slot:append>
                <q-icon v-if="userInput" name="close" size="16px"
                        class="cursor-pointer gem-icon-color"
                        @click="userInput = ''" />
              </template>
            </q-input>
            <q-btn
              round flat
              :icon="isTyping ? 'hourglass_empty' : 'arrow_upward'"
              :disable="!userInput.trim() || isTyping"
              :color="userInput.trim() && !isTyping ? 'primary' : 'grey-5'"
              class="send-btn"
              @click="sendMessage"
            />
          </div>
          <div class="input-footer-text">학원명 AI 상담 · 내용이 부정확할 수 있습니다</div>
        </div>

      </q-page>
    </q-page-container>


    <!-- ══════════════ RESERVATION REMINDER ══════════════ -->
    <q-dialog v-model="reminderOpen">
      <q-card class="reminder-card">
        <q-card-section class="reminder-header">
          <div class="text-overline" style="color: #059669;">Today Reminder</div>
          <div class="text-h6 text-weight-bold" style="color: #065f46;">오늘 예약 일정이 있어요</div>
        </q-card-section>
        <q-card-section class="q-pa-lg">
          <p class="text-body2 text-grey-8 q-mb-md">{{ reminderMessage }}</p>
          <div class="reminder-grid">
            <div v-for="item in reminderSummary" :key="item.label" class="reminder-row">
              <span class="text-grey-6 text-sm">{{ item.label }}</span>
              <strong class="text-sm">{{ item.value }}</strong>
            </div>
          </div>
          <div class="q-mt-md">
            <CampusMapPicker
              :selected-branch="todayReservation?.Branch || ''"
              @select="openReminderChat"
            />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md q-pt-none">
          <q-btn flat label="나중에 보기" color="grey-6" @click="dismissReminder" />
          <q-btn unelevated rounded label="예약 확인하기" color="primary" @click="openReminderChat" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </q-layout>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useChatStore } from '../stores/chatStore';
import { pinia } from '../stores/pinia';
import CampusMapPicker from '../components/CampusMapPicker.vue';

const $q = useQuasar();
const chatStore = useChatStore(pinia);

// ── Drawer state ──
const leftOpen = ref(true);
const rightOpen = ref(false);

// ── Input state ──
const userInput = ref('');
const isTyping = ref(false);
const inputFocused = ref(false);
const scrollAreaRef = ref(null);

// ── Store bindings ──
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

const currentEngineLabel = computed(() =>
  availableEngines.value.find(e => e.id === selectedEngine.value)?.name
  || selectedEngine.value
  || '엔진'
);

const firstUserMessage = computed(() => {
  const m = messages.value.find(m => m.role === 'user');
  if (!m) return '';
  return m.text.length > 30 ? m.text.slice(0, 30) + '…' : m.text;
});

// ── Engine selector ──
const engineOptions = computed(() =>
  availableEngines.value.map(e => ({ label: e.name, value: e.id }))
);

const engineModel = computed({
  get: () => selectedEngine.value,
  set: (val) => chatStore.setEngine(val)
});

const onEngineChange = () => {
  $q.notify({
    message: `엔진 변경: ${currentEngineLabel.value}`,
    color: 'primary',
    position: 'top',
    timeout: 1200
  });
};

// ── Navigation ──
const navItems = [
  { icon: 'menu_book',       label: '과정 안내',  prompt: '어떤 과정들이 있나요?' },
  { icon: 'event_available', label: '수강신청',   prompt: '수강 신청하고 싶어요' },
  { icon: 'apartment',       label: '학원소개',   prompt: '학원을 소개해주세요' },
  { icon: 'place',           label: '오시는길',   prompt: '캠퍼스 위치가 어디인가요?' },
];

const handleNavClick = (nav) => {
  sendSuggestion(nav.prompt);
  if ($q.screen.lt.md) leftOpen.value = false;
};

// ── Suggestions ──
const suggestions = [
  '토익 수강 예약하기',
  '영어회화 과정 알려줘',
  '예약 확인하고 싶어요',
  '캠퍼스 위치 알려줘',
];

// ── Scroll ──
const scrollToBottom = () => {
  nextTick(() => {
    scrollAreaRef.value?.setScrollPercentage('vertical', 1.0, 200);
  });
};

const scrollToTop = () => {
  scrollAreaRef.value?.setScrollPercentage('vertical', 0, 200);
};

watch(messages, () => { scrollToBottom(); }, { deep: true });

// ── Message sending ──
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

    const msgs = response.messages?.length
      ? response.messages
      : [response.ui?.prompt].filter(Boolean);

    const meta = [response.engine, response.intent, response.state]
      .filter(Boolean).join(' · ');

    msgs.forEach(m => addBotMessage(m, meta));
  } catch (err) {
    isTyping.value = false;
    addBotMessage('에러가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    console.error(err);
  }
};

const sendSuggestion = (text) => {
  userInput.value = text;
  sendMessage();
};

const sendQuickReply = (reply) => {
  userInput.value = reply;
  sendMessage();
};

const handleCampusSelect = (branch) => {
  rightOpen.value = false;
  sendSuggestion(branch);
};

// ── New chat ──
const confirmNewChat = () => {
  if (messages.value.length === 0) return;
  $q.dialog({
    title: '새 대화 시작',
    message: '현재 대화 내용이 초기화됩니다. 계속하시겠습니까?',
    cancel: true,
    persistent: false
  }).onOk(() => {
    chatStore.resetSession();
  });
};

// ── Reservation reminder ──
const reminderOpen = ref(false);
const todayReservation = ref(null);
const reminderDismissedKey = ref('');

const reminderSummary = computed(() => {
  if (!todayReservation.value) return [];
  const r = todayReservation.value;
  return [
    { label: '예약 지점', value: r.Branch || '-' },
    { label: '과정',     value: r.CourseName || '-' },
    { label: '시간',     value: `${r.Date || '-'} ${r.Time || ''}`.trim() },
    { label: '예약자',   value: r.StudentName || '-' }
  ];
});

const reminderMessage = computed(() => {
  if (!todayReservation.value) return '';
  const r = todayReservation.value;
  return `${r.StudentName || '예약자'}님, 오늘 ${r.Time || ''} ${r.Branch || ''} ${r.CourseName || ''} 예약이 예정되어 있습니다.`;
});

const dismissReminder = () => {
  reminderOpen.value = false;
  if (reminderDismissedKey.value)
    localStorage.setItem(reminderDismissedKey.value, '1');
};

const openReminderChat = () => {
  reminderOpen.value = false;
  const b = todayReservation.value?.Branch;
  sendSuggestion(b ? `${b} 예약 확인해줘` : '예약 확인해줘');
};

// ── Mount ──
onMounted(() => {
  chatStore.loadFromLocalStorage();
  chatStore.loadEngines();

  // Restore branch from campus map click on previous page
  const branchPrefill = localStorage.getItem('lex_chat_ux_branch_prefill');
  if (branchPrefill) {
    localStorage.removeItem('lex_chat_ux_branch_prefill');
    nextTick(() => sendSuggestion(branchPrefill));
  }

  // Today's reservation reminder
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  reminderDismissedKey.value = `lex_chat_ux_today_notice_dismissed_${todayKey}`;

  try {
    const stored = localStorage.getItem('lex_chat_ux_v3_state');
    if (stored) {
      const parsed = JSON.parse(stored);
      const r = parsed?.lastReservation?.fields;
      if (r?.Date === todayKey && localStorage.getItem(reminderDismissedKey.value) !== '1') {
        todayReservation.value = r;
        reminderOpen.value = true;
      }
    }
  } catch (e) { /* ignore */ }
});
</script>

<style scoped>
/* ═══════════════ HEADER ═══════════════ */
.gem-header {
  background: #ffffff;
  border-bottom: 1px solid #dce1e7;
  color: #1f1f1f;
}
.gem-icon-btn { color: #5f6368 !important; }
.gem-logo { display: flex; align-items: center; gap: 8px; }
.gem-logo-text {
  font-size: 17px; font-weight: 500; color: #1f1f1f; letter-spacing: -0.2px;
}
.gem-engine-chip { font-size: 12px; height: 28px; }

/* ═══════════════ DRAWERS ═══════════════ */
.gem-left-drawer,
.gem-right-drawer { background: #f0f4f9; }

.gem-sep { border-color: #dce1e7 !important; }

.gem-drawer-label {
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: #5f6368; padding: 2px 0;
}

.new-chat-btn {
  border-radius: 24px !important; height: 40px;
  font-size: 14px; font-weight: 500; color: #1f1f1f !important;
}
.new-chat-btn:hover { background: #e3e6ea !important; }

.gem-nav-item {
  border-radius: 24px !important;
  min-height: 40px; padding: 4px 12px;
}
.gem-nav-item:hover { background: #e3e6ea !important; }
.gem-nav-label { font-size: 14px; color: #1f1f1f; }
.gem-icon-color { color: #5f6368 !important; }

.gem-engine-select :deep(.q-field__control) {
  border-radius: 12px; font-size: 13px; background: #ffffff;
}

.recent-chat-item {
  display: flex; align-items: center; overflow: hidden;
  border-radius: 24px; padding: 8px 12px; cursor: pointer;
  color: #1f1f1f; font-size: 13px; white-space: nowrap;
}
.recent-chat-item:hover { background: #e3e6ea; }
.gem-text-2 { color: #5f6368; }

/* ═══════════════ RIGHT PANEL ═══════════════ */
.gem-panel-title {
  font-size: 11px; font-weight: 600;
  color: #5f6368; text-transform: uppercase; letter-spacing: 0.06em;
}
.summary-grid {
  background: #ffffff; border-radius: 12px; padding: 10px 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.summary-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.summary-key { font-size: 13px; color: #5f6368; }
.session-id-text {
  font-size: 11px; font-family: monospace; color: #80868b; word-break: break-all;
}

/* ═══════════════ CHAT PAGE ═══════════════ */
.gem-chat-page { background: #ffffff; }

/* ─── Welcome ─── */
.welcome-wrapper {
  min-height: 70vh; padding: 60px 24px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
}
.welcome-title {
  font-size: 2rem; font-weight: 400; color: #1f1f1f;
  margin: 0 0 8px; letter-spacing: -0.5px;
}
.welcome-sub { font-size: 15px; color: #5f6368; margin: 0; }
.suggestion-row {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 8px; max-width: 640px;
}
.suggestion-chip {
  border-color: #dce1e7 !important;
  color: #1f1f1f !important;
  font-size: 14px;
  border-radius: 24px !important;
  transition: background 0.15s;
}
.suggestion-chip:hover { background: #f0f4f9 !important; }

/* ─── Messages ─── */
.messages-list {
  max-width: 760px; margin: 0 auto; padding-bottom: 16px;
}
.msg-row {
  display: flex; align-items: flex-start; margin-bottom: 28px;
  animation: msgIn 0.22s ease-out;
}
.bot-row { gap: 12px; }
.user-row { justify-content: flex-end; }

.bot-avatar-circle {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, #e8f0fe 0%, #d2e3fc 100%);
  display: flex; align-items: center; justify-content: center;
  margin-top: 2px;
}
.bot-body { flex: 1; min-width: 0; }
.bot-name-label { font-size: 13px; font-weight: 600; color: #1f1f1f; margin-bottom: 4px; }
.bot-text { font-size: 15px; color: #1f1f1f; line-height: 1.7; }
.msg-meta { font-size: 11px; color: #80868b; margin-top: 6px; font-family: monospace; }

.user-bubble {
  background: #dce5f4; color: #1f1f1f;
  border-radius: 20px 20px 4px 20px;
  padding: 12px 18px; font-size: 15px; line-height: 1.55;
  max-width: 72%; word-break: break-word;
}

/* Typing */
.typing-dots { display: flex; gap: 4px; padding: 8px 0; }
.tdot {
  width: 8px; height: 8px; background: #bdc1c6;
  border-radius: 50%; display: inline-block;
  animation: tBounce 1.2s infinite;
}
.tdot:nth-child(2) { animation-delay: 0.15s; }
.tdot:nth-child(3) { animation-delay: 0.3s; }
@keyframes tBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* ─── Quick replies ─── */
.quick-bar {
  padding: 8px 24px 4px;
  background: #ffffff;
  border-top: 1px solid #f0f4f9;
  display: flex; flex-wrap: wrap; align-items: flex-start;
}

/* ─── Input ─── */
.gem-input-area {
  background: #ffffff;
  padding: 12px 24px 10px;
  border-top: 1px solid #f0f4f9;
}
.gem-input-bar {
  display: flex; align-items: center; gap: 8px;
  background: #f0f4f9; border-radius: 28px;
  padding: 6px 6px 6px 20px;
  max-width: 760px; margin: 0 auto;
  border: 1.5px solid transparent;
  transition: border-color 0.18s, box-shadow 0.18s;
}
.gem-input-bar.focused {
  border-color: #1a73e8;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.12);
}
.gem-input :deep(.q-field__native) { font-size: 15px; color: #1f1f1f; }
.gem-input :deep(.q-field__control) { min-height: unset; }
.send-btn { flex-shrink: 0; }
.input-footer-text {
  text-align: center; font-size: 11px; color: #9aa0a6; margin-top: 6px;
}

@keyframes msgIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ─── Reminder dialog ─── */
.reminder-card { width: min(560px, 92vw); border-radius: 20px; overflow: hidden; }
.reminder-header {
  background: #ecfdf5;
  border-bottom: 1px solid #d1fae5;
  padding: 16px 24px;
}
.reminder-grid {
  display: grid; gap: 8px;
  background: #f8fafc; border-radius: 12px; padding: 12px 16px;
}
.reminder-row { display: flex; justify-content: space-between; gap: 16px; }

/* ─── Mobile ─── */
@media (max-width: 768px) {
  .welcome-title { font-size: 1.5rem; }
  .messages-list { padding: 16px 14px; }
  .gem-input-area { padding: 10px 12px 8px; }
  .user-bubble { max-width: 85%; }
  .quick-bar { padding: 8px 12px 4px; }
}
</style>
