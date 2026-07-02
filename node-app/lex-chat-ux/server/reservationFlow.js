const SLOT_LABELS = {
  Branch: "지점",
  ProductType: "상품",
  Date: "날짜",
  Time: "시간",
  CustomerName: "고객명",
  PhoneNumber: "연락처"
};

const SLOT_PROMPTS = {
  Branch: "어느 지점에서 상담받고 싶으세요? (예: 여의도지점)",
  ProductType: "어떤 상품에 관심 있으세요? (예: ETF)",
  Date: "희망하시는 상담 날짜를 알려주세요. (예: 2026-07-15)",
  Time: "희망하시는 시간을 알려주세요. (예: 19:30)",
  CustomerName: "예약자 성함을 알려주세요. (예: 김도영)",
  PhoneNumber: "연락처를 알려주세요. (예: 010-1234-5678)"
};

const SLOT_PLACEHOLDERS = {
  Branch: "지점을 입력하세요 (예: 여의도지점)",
  ProductType: "상품을 입력하세요 (예: ETF)",
  Date: "날짜를 입력하세요 (예: 2026-07-15)",
  Time: "시간을 입력하세요 (예: 19:30)",
  CustomerName: "이름을 입력하세요 (예: 김도영)",
  PhoneNumber: "연락처를 입력하세요 (예: 010-1234-5678)"
};

const SLOT_ORDER = ["Branch", "ProductType", "Date", "Time", "CustomerName", "PhoneNumber"];
const SESSIONS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 30;

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return null;
}

function cleanTime(value) {
  const normalized = normalizeWhitespace(value);
  const compact = normalized.replace(/\s+/g, "");
  let match = compact.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  match = compact.match(/^(오전|오후)?(\d{1,2})시(?:(\d{1,2})분?)?$/);
  if (!match) return null;

  let hour = Number(match[2]);
  const minute = Number(match[3] || "0");
  const meridiem = match[1];

  if (minute < 0 || minute > 59 || hour < 1 || hour > 12) return null;
  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function cleanDate(value) {
  const normalized = normalizeWhitespace(value);
  let match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  match = normalized.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  if (!match) return null;
  const now = new Date();
  const year = now.getFullYear();
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cleanName(value) {
  const normalized = normalizeWhitespace(value).replace(/(입니다|이에요|예요|이요)$/u, "").trim();
  if (!normalized) return null;
  if (/\d/.test(normalized)) return null;
  if (normalized.length > 20) return null;
  return normalized;
}

function buildSlots(slots) {
  const out = {};
  for (const key of SLOT_ORDER) {
    const value = slots[key];
    if (!value) continue;
    out[key] = {
      original: value,
      interpreted: value,
      resolved: [value]
    };
  }
  return out;
}

function buildSummary(slots) {
  return SLOT_ORDER
    .filter((key) => slots[key])
    .map((key) => ({
      key,
      label: SLOT_LABELS[key],
      value: slots[key]
    }));
}

function getNextMissingSlot(slots) {
  return SLOT_ORDER.find((slot) => !slots[slot]) || null;
}

function getSession(sessionId) {
  const current = SESSIONS.get(sessionId);
  if (!current) return null;
  if (Date.now() - current.updatedAt > SESSION_TTL_MS) {
    SESSIONS.delete(sessionId);
    return null;
  }
  return current;
}

function saveSession(sessionId, state) {
  SESSIONS.set(sessionId, {
    ...state,
    updatedAt: Date.now()
  });
}

function clearSession(sessionId) {
  SESSIONS.delete(sessionId);
}

function extractChoice(text, choices) {
  const normalized = normalizeWhitespace(text);
  return choices.find((choice) => normalized.includes(choice)) || null;
}

function extractSlotValue(slot, text, catalogs) {
  if (!text) return null;
  if (slot === "Branch") return extractChoice(text, catalogs.branches);
  if (slot === "ProductType") return extractChoice(text, catalogs.products);
  if (slot === "Date") return cleanDate(text);
  if (slot === "Time") return cleanTime(text);
  if (slot === "PhoneNumber") return cleanPhone(text);
  if (slot === "CustomerName") return cleanName(text);
  return null;
}

function extractAll(text, catalogs, options = {}) {
  const includeCustomerName = options.includeCustomerName === true;
  const slots = {};
  for (const slot of SLOT_ORDER) {
    if (slot === "CustomerName" && !includeCustomerName) continue;
    const value = extractSlotValue(slot, text, catalogs);
    if (value) slots[slot] = value;
  }
  return slots;
}

function isReservationIntent(text) {
  const normalized = normalizeWhitespace(text);
  return /(예약|상담신청|상담\s*예약|등록)/.test(normalized);
}

function hasReservationSignals(detected) {
  return Boolean(
    detected.Branch ||
    detected.ProductType ||
    detected.Date ||
    detected.Time ||
    detected.PhoneNumber
  );
}

function makePromptResponse({ sessionId, slots, slot, suggestions }) {
  return {
    sessionId,
    intent: "BookConsultation",
    state: "InProgress",
    ui: {
      mode: "elicit_slot",
      slotToElicit: slot,
      slotLabel: SLOT_LABELS[slot],
      prompt: SLOT_PROMPTS[slot],
      placeholder: SLOT_PLACEHOLDERS[slot],
      quickReplies: suggestions
    },
    messages: [SLOT_PROMPTS[slot]],
    slots: buildSlots(slots),
    summary: buildSummary(slots),
    raw: {
      source: "reservation-flow",
      sessionId,
      slots
    }
  };
}

function makeCloseResponse({ sessionId, slots, consultationId }) {
  const message = `투자상담 예약이 완료되었습니다.\n예약번호: ${consultationId}\n지점: ${slots.Branch} / 상품: ${slots.ProductType} / 일시: ${slots.Date} ${slots.Time}\n담당 PB가 방문 전날 ${slots.PhoneNumber}으로 사전 연락드립니다.`;
  return {
    sessionId,
    intent: "BookConsultation",
    state: "Fulfilled",
    ui: {
      mode: "close",
      prompt: message
    },
    messages: [message],
    slots: buildSlots(slots),
    summary: buildSummary(slots),
    raw: {
      source: "reservation-flow",
      sessionId,
      consultationId,
      slots
    }
  };
}

async function runReservationFlow({ text, sessionId, getSuggestions }) {
  const branches = await getSuggestions("Branch");
  const products = await getSuggestions("ProductType");
  const catalogs = { branches, products };
  const existing = getSession(sessionId);
  const expectedSlot = existing ? getNextMissingSlot(existing.slots || {}) : null;
  const detected = extractAll(text, catalogs, {
    includeCustomerName: expectedSlot === "CustomerName"
  });

  if (!existing && !isReservationIntent(text) && !hasReservationSignals(detected)) {
    return null;
  }

  const slots = {
    ...(existing?.slots || {}),
    ...detected
  };

  const nextSlot = getNextMissingSlot(slots);

  if (!nextSlot) {
    const consultationId = `C-${Date.now().toString(36).toUpperCase()}`;
    clearSession(sessionId);
    return makeCloseResponse({ sessionId, slots, consultationId });
  }

  saveSession(sessionId, { slots });

  const suggestions =
    nextSlot === "Branch" ? branches :
    nextSlot === "ProductType" ? products :
    [];

  return makePromptResponse({
    sessionId,
    slots,
    slot: nextSlot,
    suggestions
  });
}

module.exports = {
  runReservationFlow
};
