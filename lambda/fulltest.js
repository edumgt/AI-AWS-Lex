/**
 * Amazon Lex V2 + API Gateway HTTP API 겸용 Lambda (Node.js / CommonJS)
 *
 * - Lex V2 이벤트: event.sessionState.intent 기준 처리
 * - API Gateway HTTP API (payload 2.0): event.requestContext.http 기준 처리
 */

const BRANCHES = [
  { id: "gangnam", name: "강남점", address: "서울 강남구", phone: "02-1111-1111" },
  { id: "sinchon", name: "신촌점", address: "서울 서대문구", phone: "02-2222-2222" },
  { id: "daegu", name: "대구점", address: "대구 중구", phone: "053-333-3333" }
];

const COURSES = [
  { id: "toeic", name: "토익", category: "어학", description: "점수 보장형 토익 대비 과정" },
  { id: "conversation", name: "회화", category: "어학", description: "실전 영어 회화 과정" },
  { id: "certificate", name: "자격증", category: "취업", description: "취업/직무 자격증 대비 과정" }
];

function getSlotValue(slots, slotName) {
  const slot = slots?.[slotName];
  return slot?.value?.interpretedValue || slot?.value?.originalValue || null;
}

function close(event, fulfillmentState, message) {
  return {
    sessionState: {
      ...event.sessionState,
      intent: {
        ...event.sessionState.intent,
        state: fulfillmentState
      }
    },
    messages: [{ contentType: "PlainText", content: message }]
  };
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

function text(statusCode, message) {
  return {
    statusCode,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: message
  };
}

function parseJsonBody(body) {
  if (!body) return {};
  try {
    return typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return {};
  }
}

function findBranch(keyword) {
  if (!keyword) return null;
  const q = String(keyword).trim();
  return BRANCHES.find(
    b => b.name === q || b.id === q || b.name.includes(q)
  ) || null;
}

function findCourse(keyword) {
  if (!keyword) return null;
  const q = String(keyword).trim();
  return COURSES.find(
    c => c.name === q || c.id === q || c.name.includes(q)
  ) || null;
}

exports.handler = async (event) => {
  // --------------------------------------------------
  // 1) API Gateway HTTP API (payloadFormatVersion 2.0)
  // --------------------------------------------------
  const method = event?.requestContext?.http?.method;
  const path = event?.requestContext?.http?.path;

  if (method && path) {
    if (method === "GET" && path === "/health") {
      return json(200, {
        ok: true,
        service: "LexReservationFulfillment",
        routes: ["/health", "/branches", "/courses", "/reservation"],
        timestamp: new Date().toISOString()
      });
    }

    if (method === "GET" && path === "/branches") {
      return json(200, {
        count: BRANCHES.length,
        items: BRANCHES
      });
    }

    if (method === "GET" && path === "/courses") {
      return json(200, {
        count: COURSES.length,
        items: COURSES
      });
    }

    // 간단 예약 API (데모)
    if (method === "POST" && path === "/reservation") {
      const body = parseJsonBody(event.body);
      const branchInput = body.branch;
      const courseInput = body.courseName || body.course;
      const date = body.date || null;
      const time = body.time || null;
      const name = body.studentName || body.name || null;
      const phone = body.phoneNumber || body.phone || null;

      const branch = findBranch(branchInput);
      const course = findCourse(courseInput);

      const reservationId = `R-${Date.now().toString(36).toUpperCase()}`;

      return json(200, {
        ok: true,
        message: "예약 완료",
        reservation: {
          reservationId,
          branch: branch?.name || branchInput || null,
          course: course?.name || courseInput || null,
          date,
          time,
          name,
          phone
        }
      });
    }

    if (method === "GET" && path === "/") {
      return text(200, "API is running");
    }

    return json(404, {
      ok: false,
      message: "Not Found",
      method,
      path
    });
  }

  // --------------------------------------------------
  // 2) Lex V2 이벤트 처리
  // --------------------------------------------------
  const intentName = event.sessionState?.intent?.name;
  const slots = event.sessionState?.intent?.slots || {};
  const sessionAttrs = event.sessionState?.sessionAttributes || {};

  // API Gateway도 아니고 Lex도 아니면 방어
  if (!intentName) {
    return json(400, {
      ok: false,
      message: "Unsupported event format"
    });
  }

  if (intentName === "MakeReservation") {
    const branch = getSlotValue(slots, "Branch");
    const course = getSlotValue(slots, "CourseName");
    const date = getSlotValue(slots, "Date");
    const time = getSlotValue(slots, "Time");
    const name = getSlotValue(slots, "StudentName");
    const phone = getSlotValue(slots, "PhoneNumber");

    const reservationId = `R-${Date.now().toString(36).toUpperCase()}`;

    const newSessionAttrs = {
      ...sessionAttrs,
      lastReservationId: reservationId,
      lastReservationSummary: JSON.stringify({
        reservationId, branch, course, date, time, name, phone
      })
    };

    event.sessionState.sessionAttributes = newSessionAttrs;

    return {
      sessionState: {
        ...event.sessionState,
        intent: { ...event.sessionState.intent, state: "Fulfilled" },
        sessionAttributes: newSessionAttrs
      },
      messages: [
        {
          contentType: "PlainText",
          content: `예약 완료! 예약번호는 ${reservationId} 입니다. (${branch || "지점 미상"} / ${course || "과정 미상"} / ${date || "날짜 미상"} ${time || ""})`
        }
      ]
    };
  }

  if (intentName === "CancelReservation") {
    const reservationId = getSlotValue(slots, "ReservationId") || sessionAttrs.lastReservationId;

    if (!reservationId) {
      return close(event, "Failed", "취소할 예약번호를 찾지 못했어요. 예약번호를 알려주세요.");
    }

    const newSessionAttrs = { ...sessionAttrs, lastCancelledReservationId: reservationId };
    return {
      sessionState: {
        ...event.sessionState,
        intent: { ...event.sessionState.intent, state: "Fulfilled" },
        sessionAttributes: newSessionAttrs
      },
      messages: [{ contentType: "PlainText", content: `예약(${reservationId}) 취소가 완료됐어요.` }]
    };
  }

  if (intentName === "CheckReservation") {
    const reservationId = getSlotValue(slots, "ReservationId") || sessionAttrs.lastReservationId;

    if (!reservationId) {
      return close(event, "Failed", "조회할 예약번호를 찾지 못했어요. 예약번호를 알려주세요.");
    }

    const summaryRaw = sessionAttrs.lastReservationSummary;
    if (summaryRaw) {
      try {
        const summary = JSON.parse(summaryRaw);
        if (summary.reservationId === reservationId) {
          return close(
            event,
            "Fulfilled",
            `예약 조회: ${summary.branch || "지점"} / ${summary.course || "과정"} / ${summary.date || ""} ${summary.time || ""} (예약번호 ${reservationId})`
          );
        }
      } catch (_) {}
    }

    return close(event, "Fulfilled", `예약번호 ${reservationId} 로 등록된 예약을 찾지 못했어요(데모 환경).`);
  }

  if (intentName === "CourseInfo") {
    const course = getSlotValue(slots, "CourseName");
    if (!course) {
      const names = COURSES.map(c => c.name).join(", ");
      return close(event, "Fulfilled", `과정 목록: ${names}`);
    }
    return close(event, "Fulfilled", `${course} 과정은 주 2회/주 3회 선택 가능하고, 레벨 테스트 후 반 편성이 진행돼요(데모 안내).`);
  }

  if (intentName === "Help") {
    const branchNames = BRANCHES.map(b => b.name).join(", ");
    const courseNames = COURSES.map(c => c.name).join(", ");
    return close(
      event,
      "Fulfilled",
      `가능한 기능: 수강 상담, 예약, 예약 조회/취소. 지점: ${branchNames}. 과정: ${courseNames}. 예) '강남점 토익 예약하고 싶어'`
    );
  }

  return close(event, "Fulfilled", "죄송해요, 잘 이해하지 못했어요. '예약', '조회', '취소', '과정 안내' 중으로 다시 말씀해 주세요.");
};