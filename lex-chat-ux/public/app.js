(function () {
  const $chat = document.getElementById("chat");
  const $chips = document.getElementById("chips");
  const $input = document.getElementById("input");
  const $send = document.getElementById("sendBtn");
  const $sessionLabel = document.getElementById("sessionLabel");
  const $newSession = document.getElementById("newSessionBtn");
  const $summary = document.getElementById("summary");

  const LS_KEY = "lex_chat_ux_v2_state";

  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch (_) { return {}; }
  }
  function saveState(patch) {
    const s = loadState();
    const next = { ...s, ...patch, updatedAt: Date.now() };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    return next;
  }

  function getSessionId() {
    return loadState().sessionId || "";
  }
  function setSessionId(id) {
    saveState({ sessionId: id });
    $sessionLabel.textContent = id ? `session: ${id}` : "session: (new)";
  }

  function getHistory() {
    return loadState().history || [];
  }
  function setHistory(history) {
    saveState({ history });
  }

  function getLastSummary() {
    return loadState().summary || [];
  }
  function setLastSummary(summary) {
    saveState({ summary });
  }

  function newSession() {
    setSessionId("");
    setHistory([]);
    setLastSummary([]);
    $chat.innerHTML = "";
    $chips.innerHTML = "";
    renderSummary([]);
    addBot("새 세션을 시작했어요. 예) “강남점 토익 예약하고 싶어요”");
    $input.focus();
    setInputUx({ mode: "message" });
  }

  function scrollToBottom() {
    $chat.scrollTop = $chat.scrollHeight;
  }

  function bubble(role, text, meta) {
    const row = document.createElement("div");
    row.className = `row ${role}`;
    const b = document.createElement("div");
    b.className = `bubble ${role}`;
    b.textContent = text;
    if (meta) {
      const small = document.createElement("span");
      small.className = "small";
      small.textContent = meta;
      b.appendChild(small);
    }
    row.appendChild(b);
    $chat.appendChild(row);
    scrollToBottom();
    return row;
  }

  function addUser(text) {
    bubble("user", text);
    const history = [...getHistory(), { role: "user", text, ts: Date.now() }];
    setHistory(history);
  }
  function addBot(text, meta) {
    bubble("bot", text, meta);
    const history = [...getHistory(), { role: "bot", text, meta: meta || "", ts: Date.now() }];
    setHistory(history);
  }

  function showTyping() {
    const row = document.createElement("div");
    row.className = "row bot";
    const b = document.createElement("div");
    b.className = "bubble bot";
    const t = document.createElement("div");
    t.className = "typing";
    t.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span><span style="margin-left:8px">응답 중...</span>';
    b.appendChild(t);
    row.appendChild(b);
    $chat.appendChild(row);
    scrollToBottom();
    return row;
  }

  function setChips(list) {
    $chips.innerHTML = "";
    (list || []).forEach(label => {
      const c = document.createElement("button");
      c.className = "chip";
      c.type = "button";
      c.textContent = label;
      c.addEventListener("click", () => {
        $input.value = label;
        $input.focus();
      });
      $chips.appendChild(c);
    });
  }

  function renderSummary(summaryItems) {
    $summary.innerHTML = "";
    const items = (summaryItems && summaryItems.length) ? summaryItems : [];
    // always show common keys even if empty, for UX
    const defaultKeys = ["지점","과정","날짜","시간","이름","연락처","예약번호"];
    const normalized = items.length ? items : defaultKeys.map(l => ({ label: l, value: null }));

    normalized.forEach(it => {
      const pill = document.createElement("div");
      pill.className = "pill" + (it.value ? "" : " empty");
      pill.innerHTML = `<span class="k">${escapeHtml(it.label)}</span><span class="v">${escapeHtml(it.value || "—")}</span>`;
      $summary.appendChild(pill);
    });
  }

  function escapeHtml(s) {
    return (s ?? "").toString()
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function setInputUx(ui) {
    const mode = ui?.mode || "message";
    const slot = ui?.slotToElicit || "";

    // reset
    $input.type = "text";
    $input.inputMode = "text";
    $input.placeholder = ui?.placeholder || "메시지를 입력하세요...";
    $input.maxLength = 200;

    // slot-specific UX
    if (mode === "elicit_slot") {
      if (slot === "PhoneNumber") {
        $input.type = "tel";
        $input.inputMode = "tel";
        $input.placeholder = ui?.placeholder || "010-1234-5678";
        $input.maxLength = 13;
      } else if (slot === "Time") {
        $input.type = "time";
        $input.inputMode = "numeric";
        $input.placeholder = ui?.placeholder || "19:30";
      } else if (slot === "Date") {
        // 브라우저가 date를 지원하면 native picker 느낌
        $input.type = "date";
        $input.inputMode = "numeric";
        $input.placeholder = ui?.placeholder || "2026-02-10";
      } else {
        $input.type = "text";
        $input.inputMode = "text";
      }
    } else if (mode === "confirm_intent") {
      $input.placeholder = "네/아니요로 답하거나 내용을 수정해 주세요";
    }
  }

  // phone mask: 01012345678 -> 010-1234-5678
  function formatPhone(value) {
    const digits = (value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0,3)}-${digits.slice(3)}`;
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  }

  // attach input handler (dynamic)
  $input.addEventListener("input", () => {
    // Only mask when it looks like tel input
    if ($input.type === "tel") {
      const before = $input.value;
      const after = formatPhone(before);
      if (before !== after) $input.value = after;
    }
  });

  async function send(text) {
    const sessionId = getSessionId();
    const typingRow = showTyping();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sessionId })
    }).then(r => r.json());

    typingRow.remove();

    if (res.error) {
      addBot(`에러: ${res.error}`, res.hint || "");
      return;
    }

    if (!sessionId && res.sessionId) setSessionId(res.sessionId);

    // 요약 저장/렌더
    if (Array.isArray(res.summary)) {
      setLastSummary(res.summary);
      renderSummary(res.summary);
    }

    // 메시지 출력
    const msgs = (res.messages && res.messages.length) ? res.messages : [res.ui?.prompt].filter(Boolean);
    const meta = res.intent ? `${res.intent} · ${res.state || ""}` : "";
    msgs.forEach(m => addBot(m, meta));

    // Chips/입력 UX 업데이트
    setInputUx(res.ui);

    if (res.ui?.mode === "elicit_slot") {
      const quick = res.ui.quickReplies || [];
      setChips(quick);
    } else if (res.ui?.mode === "confirm_intent") {
      setChips(res.ui.quickReplies || ["네", "아니요"]);
    } else {
      setChips([]);
    }
  }

  function onSend() {
    const text = ($input.value || "").trim();
    if (!text) return;
    $input.value = "";
    addUser(text);
    send(text).catch(err => addBot(`에러: ${err.message || err}`));
  }

  function restore() {
    // session
    setSessionId(getSessionId());
    // history
    const history = getHistory();
    if (history.length) {
      $chat.innerHTML = "";
      history.forEach(m => bubble(m.role, m.text, m.meta));
    } else {
      addBot("안녕하세요! Lex와 연결된 데모 채팅입니다. 예) “강남점 토익 예약하고 싶어요”");
    }
    // summary
    renderSummary(getLastSummary());
  }

  // init
  restore();

  $send.addEventListener("click", onSend);
  $input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSend();
  });
  $newSession.addEventListener("click", newSession);
})();
