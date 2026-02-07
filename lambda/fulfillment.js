/**
 * Amazon Lex V2 Lambda Fulfillment (Node.js / CommonJS)
 *
 * 핵심 포인트
 * - event.sessionState.intent.name 으로 인텐트 식별
 * - slots 에서 값 추출(interpretationValue)
 * - 응답은 sessionState + messages 로 반환
 *
 * 참고: Lex V2는 DialogCodeHook(슬롯 수집/검증 단계)도 가능하지만,
 * 본 실습은 Fulfillment 중심으로 간단히 구성했습니다.
 */

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

exports.handler = async (event) => {
  const intentName = event.sessionState?.intent?.name;
  const slots = event.sessionState?.intent?.slots || {};
  const sessionAttrs = event.sessionState?.sessionAttributes || {};

  // 간단한 "예약 DB"를 흉내내기 위해 sessionAttributes를 사용(데모용)
  // 실제로는 DynamoDB/RDS/외부 API 등으로 대체
  if (intentName === "MakeReservation") {
    const branch = getSlotValue(slots, "Branch");
    const course = getSlotValue(slots, "CourseName");
    const date = getSlotValue(slots, "Date");
    const time = getSlotValue(slots, "Time");
    const name = getSlotValue(slots, "StudentName");
    const phone = getSlotValue(slots, "PhoneNumber");

    // 예약번호 생성(데모)
    const reservationId = `R-${Date.now().toString(36).toUpperCase()}`;

    const newSessionAttrs = {
      ...sessionAttrs,
      lastReservationId: reservationId,
      lastReservationSummary: JSON.stringify({ reservationId, branch, course, date, time, name, phone })
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

    // 실제 취소 로직은 DB/API로 대체
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
          return close(event, "Fulfilled", `예약 조회: ${summary.branch || "지점"} / ${summary.course || "과정"} / ${summary.date || ""} ${summary.time || ""} (예약번호 ${reservationId})`);
        }
      } catch (e) {}
    }

    // 데모: DB가 없으므로 "없음" 처리
    return close(event, "Fulfilled", `예약번호 ${reservationId} 로 등록된 예약을 찾지 못했어요(데모 환경).`);
  }

  if (intentName === "CourseInfo") {
    const course = getSlotValue(slots, "CourseName");
    if (!course) return close(event, "Fulfilled", "어떤 과정이 궁금하세요? 예: 토익, 회화, 자격증");
    return close(event, "Fulfilled", `${course} 과정은 주 2회/주 3회 선택 가능하고, 레벨 테스트 후 반 편성이 진행돼요(데모 안내).`);
  }

  if (intentName === "Help") {
    return close(event, "Fulfilled", "가능한 기능: 수강 상담, 예약, 예약 조회/취소. 예) '강남점 토익 예약하고 싶어'");
  }

  // 기본 fallback
  return close(event, "Fulfilled", "죄송해요, 잘 이해하지 못했어요. '예약', '조회', '취소', '과정 안내' 중으로 다시 말씀해 주세요.");
};
