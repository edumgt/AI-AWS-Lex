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
  // 1) API Gateway HTTP API health check 처리
  const method = event?.requestContext?.http?.method;
  const path = event?.requestContext?.http?.path;

  if (method === "GET" && path === "/health") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        service: "LexReservationFulfillment"
      })
    };
  }

  // 2) Lex 이벤트가 아니면 방어 처리
  if (!event?.sessionState?.intent) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Unsupported event format"
      })
    };
  }

  // 3) 기존 Lex 처리
  const intentName = event.sessionState.intent.name;
  const slots = event.sessionState.intent.slots || {};

  if (intentName === "ReservationIntent") {
    const branch = getSlotValue(slots, "Branch");
    const course = getSlotValue(slots, "Course");

    return close(
      event,
      "Fulfilled",
      `${branch || "지점"} ${course || "과정"} 예약 요청이 접수되었습니다.`
    );
  }

  return close(event, "Fulfilled", "요청을 처리했습니다.");
};