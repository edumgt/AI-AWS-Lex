/**
 * Lex Runtime V2 raw 응답을 "대화형 UX"에 맞는 구조로 변환
 */

const SLOT_PLACEHOLDERS = {
  Branch: "지점을 입력하세요 (예: 강남점)",
  CourseName: "과정을 입력하세요 (예: 토익)",
  Date: "날짜를 입력하세요 (예: 2월 10일)",
  Time: "시간을 입력하세요 (예: 19:30)",
  StudentName: "이름을 입력하세요 (예: 김도영)",
  PhoneNumber: "연락처를 입력하세요 (예: 010-1234-5678)",
  ReservationId: "예약번호를 입력하세요"
};

const SLOT_LABELS = {
  Branch: "지점",
  CourseName: "과정",
  Date: "날짜",
  Time: "시간",
  StudentName: "이름",
  PhoneNumber: "연락처",
  ReservationId: "예약번호"
};

const SUMMARY_ORDER = ["Branch","CourseName","Date","Time","StudentName","PhoneNumber","ReservationId"];

function safeTextMessages(raw) {
  const msgs = raw?.messages || [];
  return msgs
    .map(m => (m?.content || "").trim())
    .filter(Boolean);
}

function normalizeSlots(raw) {
  const slots = raw?.sessionState?.intent?.slots || {};
  const out = {};
  for (const [k, v] of Object.entries(slots)) {
    if (!v || !v.value) out[k] = null;
    else {
      out[k] = {
        original: v.value.originalValue ?? null,
        interpreted: v.value.interpretedValue ?? null,
        resolved: Array.isArray(v.value.resolvedValues) ? v.value.resolvedValues : []
      };
    }
  }
  return out;
}

function computeUi(raw) {
  const da = raw?.sessionState?.dialogAction || {};
  const type = da.type || "Unknown";

  if (type === "ElicitSlot") {
    const slotToElicit = da.slotToElicit;
    const prompt = safeTextMessages(raw)[0] || "값을 입력해 주세요.";
    return {
      mode: "elicit_slot",
      slotToElicit,
      slotLabel: SLOT_LABELS[slotToElicit] || slotToElicit,
      prompt,
      placeholder: SLOT_PLACEHOLDERS[slotToElicit] || "답변을 입력하세요",
      // server/index.js에서 quickReplies를 주입할 수 있음
      quickReplies: []
    };
  }

  if (type === "ConfirmIntent") {
    const prompt = safeTextMessages(raw)[0] || "진행할까요?";
    return {
      mode: "confirm_intent",
      prompt,
      quickReplies: ["네", "아니요"]
    };
  }

  if (type === "Close") {
    const prompt = safeTextMessages(raw)[0] || "완료되었습니다.";
    return { mode: "close", prompt };
  }

  // Fallback / Delegate / ElicitIntent etc.
  const prompt = safeTextMessages(raw)[0] || null;
  return { mode: "message", prompt, dialogActionType: type };
}

function buildSummary(slots) {
  const items = [];
  for (const k of SUMMARY_ORDER) {
    if (!(k in slots)) continue;
    const v = slots[k];
    const value = v?.interpreted || v?.original || null;
    items.push({ key: k, label: SLOT_LABELS[k] || k, value });
  }
  return items;
}

function formatLexResponse({ raw, sessionId }) {
  const intent = raw?.sessionState?.intent?.name || null;
  const state = raw?.sessionState?.intent?.state || null;
  const messages = safeTextMessages(raw);
  const slots = normalizeSlots(raw);
  const ui = computeUi(raw);

  const summary = buildSummary(slots);

  const rawLite = {
    sessionId: raw?.sessionId,
    messages: raw?.messages,
    sessionState: raw?.sessionState,
    interpretations: raw?.interpretations?.slice?.(0, 2),
    metadata: raw?.$metadata
  };

  return {
    sessionId,
    intent,
    state,
    ui,
    messages,
    slots,
    summary,
    raw: rawLite
  };
}

module.exports = { formatLexResponse };
