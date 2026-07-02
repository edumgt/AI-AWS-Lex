// 챗봇 위젯 (Node 버전 ChatbotDialog.vue + chatStore.js 를 vanilla JS로 포팅)
// 음성 입력(Amazon Transcribe 연동)은 AWS 의존성을 없애기로 한 이번 rewrite 범위에서 제외했다.

const STORAGE_KEY = 'kf_chatbot_state_v1';
const ENGINE = 'local-rule';
const GREETING = '안녕하세요! KF증권 AI 투자상담입니다.\n예) "여의도지점 ETF 투자상담 예약하고 싶어요"';
const MAP_KEYWORDS = ['약도', '지도', '위치', '어디', '찾아가', '오시는', '주소', '지점 안내', '지점안내', '길 안내', '어떻게 가', '위치안내'];

const state = {
  messages: [],
  sessionId: '',
  summaryItems: [],
  quickReplies: [],
  slotToElicit: '',
  inputPlaceholder: '메시지를 입력하세요...',
  inputType: 'text',
};

function isMapQuery(text) {
  return MAP_KEYWORDS.some((kw) => text.includes(kw));
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ messages: state.messages, sessionId: state.sessionId, summaryItems: state.summaryItems })
  );
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.messages = stored.messages || [];
    state.sessionId = stored.sessionId || '';
    state.summaryItems = stored.summaryItems || [];
  } catch {
    /* ignore corrupt state */
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let els = {};

function initChatWidget() {
  els = {
    fab: document.getElementById('chatFab'),
    backdrop: document.getElementById('chatBackdrop'),
    popup: document.getElementById('chatPopup'),
    close: document.getElementById('cpClose'),
    reset: document.getElementById('cpReset'),
    summary: document.getElementById('cpSummary'),
    chips: document.getElementById('cpChips'),
    msgList: document.getElementById('cpMsgList'),
    messages: document.getElementById('cpMessages'),
    quick: document.getElementById('cpQuick'),
    input: document.getElementById('cpInput'),
    inputBar: document.getElementById('cpInputBar'),
    send: document.getElementById('cpSend'),
  };

  loadState();
  renderMessages();
  renderSummary();

  els.fab.addEventListener('click', openChat);
  els.backdrop.addEventListener('click', closeChat);
  els.close.addEventListener('click', closeChat);
  els.reset.addEventListener('click', resetSession);
  els.send.addEventListener('click', () => sendMessage());
  els.input.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  els.input.addEventListener('focus', () => els.inputBar.classList.add('focused'));
  els.input.addEventListener('blur', () => els.inputBar.classList.remove('focused'));
}

function openChat() {
  els.popup.classList.add('open');
  els.backdrop.classList.add('open');
  if (state.messages.length === 0) {
    addBotMessage(GREETING);
  }
  renderQuickReplies();
  setTimeout(() => {
    scrollToBottom();
    els.input.focus();
  }, 0);

  const branch = localStorage.getItem('kf_chatbot_branch_prefill');
  if (branch) {
    localStorage.removeItem('kf_chatbot_branch_prefill');
    setTimeout(() => sendQuickReply(branch), 0);
  }
}

function closeChat() {
  els.popup.classList.remove('open');
  els.backdrop.classList.remove('open');
}

window.openChatbot = openChat;

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function addBotMessage(text, meta = '', type = 'text') {
  state.messages.push({ role: 'bot', text, meta, type });
  saveState();
  renderMessages();
}

function addUserMessage(text) {
  state.messages.push({ role: 'user', text });
  saveState();
  renderMessages();
}

function renderMessages() {
  els.msgList.innerHTML = '';
  state.messages.forEach((msg) => {
    const row = document.createElement('div');
    row.className = `cp-msg-row ${msg.role === 'user' ? 'user' : 'bot'}`;

    if (msg.role === 'user') {
      row.innerHTML = `<div class="cp-user-bubble">${escapeHtml(msg.text)}</div>`;
    } else if (msg.type === 'map') {
      row.innerHTML = `
        <div class="cp-bot-avatar"><span class="material-icons" style="font-size:14px">smart_toy</span></div>
        <div class="cp-bot-bubble"><div class="cp-bot-name">KF증권 AI</div></div>`;
      const bubble = row.querySelector('.cp-bot-bubble');
      window.BranchMap.renderBranchMapCard(bubble, handleMapBook);
    } else {
      row.innerHTML = `
        <div class="cp-bot-avatar"><span class="material-icons" style="font-size:14px">smart_toy</span></div>
        <div class="cp-bot-bubble">
          <div class="cp-bot-name">KF증권 AI</div>
          <div class="cp-bot-text">${escapeHtml(msg.text)}</div>
          ${msg.meta ? `<div class="cp-meta">${escapeHtml(msg.meta)}</div>` : ''}
        </div>`;
    }
    els.msgList.appendChild(row);
  });
  scrollToBottom();
}

function setTyping(isTyping) {
  let row = document.getElementById('cpTypingRow');
  if (isTyping) {
    if (row) return;
    row = document.createElement('div');
    row.id = 'cpTypingRow';
    row.className = 'cp-msg-row bot';
    row.innerHTML = `
      <div class="cp-bot-avatar"><span class="material-icons" style="font-size:14px">smart_toy</span></div>
      <div class="cp-bot-bubble"><div class="cp-typing"><span class="td"></span><span class="td"></span><span class="td"></span></div></div>`;
    els.msgList.appendChild(row);
    scrollToBottom();
  } else if (row) {
    row.remove();
  }
}

function renderSummary() {
  if (!state.summaryItems.length) {
    els.summary.style.display = 'none';
    return;
  }
  els.summary.style.display = 'block';
  els.chips.innerHTML = state.summaryItems
    .map((item) => `<span class="cp-chip"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value || '—')}</span>`)
    .join('');
}

function renderQuickReplies() {
  els.quick.innerHTML = '';
  if (state.slotToElicit === 'Branch') {
    els.quick.style.display = 'flex';
    window.BranchMap.renderCampusPicker(els.quick, sendQuickReply);
    return;
  }
  if (state.quickReplies.length > 0) {
    els.quick.style.display = 'flex';
    state.quickReplies.forEach((reply) => {
      const btn = document.createElement('button');
      btn.className = 'cp-qchip';
      btn.textContent = reply;
      btn.addEventListener('click', () => sendQuickReply(reply));
      els.quick.appendChild(btn);
    });
    return;
  }
  els.quick.style.display = 'none';
}

function updateInputUI(ui) {
  if (!ui) return;
  const mode = ui.mode || 'message';
  state.slotToElicit = ui.slotToElicit || '';
  state.inputType = 'text';
  state.inputPlaceholder = ui.placeholder || '메시지를 입력하세요...';

  if (mode === 'elicit_slot') {
    if (state.slotToElicit === 'PhoneNumber') state.inputType = 'tel';
    else if (state.slotToElicit === 'Time') state.inputType = 'time';
    else if (state.slotToElicit === 'Date') state.inputType = 'date';
  } else if (mode === 'confirm_intent') {
    state.inputPlaceholder = '네/아니요로 답하거나 내용을 수정해 주세요';
  }

  els.input.type = state.inputType;
  els.input.placeholder = state.inputPlaceholder;

  state.quickReplies = mode === 'elicit_slot' || mode === 'confirm_intent' ? ui.quickReplies || [] : [];
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text) return;

  addUserMessage(text);
  els.input.value = '';
  setTyping(true);
  els.send.disabled = true;

  try {
    const data = await window.Api.sendChat(text, state.sessionId, ENGINE);
    setTyping(false);
    els.send.disabled = false;

    if (data.sessionId && !state.sessionId) state.sessionId = data.sessionId;
    if (Array.isArray(data.summary)) state.summaryItems = data.summary;

    updateInputUI(data.ui);
    renderSummary();
    renderQuickReplies();

    const msgs = data.messages && data.messages.length ? data.messages : [data.ui && data.ui.prompt].filter(Boolean);
    const meta = [data.engine, data.intent, data.state].filter(Boolean).join(' · ');
    msgs.forEach((m) => addBotMessage(m, meta));

    if (isMapQuery(text)) {
      addBotMessage('', '', 'map');
    }
    saveState();
  } catch (err) {
    setTyping(false);
    els.send.disabled = false;
    addBotMessage('에러가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

function sendQuickReply(reply) {
  els.input.value = reply;
  sendMessage();
}

function handleMapBook(branchName) {
  els.input.value = `${branchName} 상담 예약하고 싶어요`;
  sendMessage();
}

function resetSession() {
  if (state.messages.length === 0) return;
  if (!confirm('현재 대화가 초기화됩니다. 계속하시겠습니까?')) return;

  state.messages = [];
  state.sessionId = '';
  state.summaryItems = [];
  state.quickReplies = [];
  state.slotToElicit = '';
  state.inputPlaceholder = '메시지를 입력하세요...';
  state.inputType = 'text';
  localStorage.removeItem(STORAGE_KEY);

  renderMessages();
  renderSummary();
  renderQuickReplies();
  addBotMessage(GREETING);
}

document.addEventListener('DOMContentLoaded', initChatWidget);
