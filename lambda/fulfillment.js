/**
 * Amazon Lex V2 Lambda Fulfillment (Node.js / CommonJS)
 * 도메인: 금융투자/증권사 투자상담 챗봇
 *
 * 인텐트: BookConsultation / CheckConsultation / CancelConsultation / ProductInfo / Help
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

const PRODUCT_INFO = {
  "국내주식": "국내주식은 KRX에 상장된 주식을 매매하는 상품입니다. 위탁매매 수수료는 온라인 기준 0.015%이며, 실시간 HTS/MTS 거래가 가능합니다.",
  "해외주식": "해외주식은 미국·홍콩·중국·일본 등 글로벌 시장 주식을 매매합니다. 환율 리스크가 있으며 결제는 T+2 기준입니다.",
  "ETF": "ETF(상장지수펀드)는 특정 지수를 추종하는 펀드로 주식처럼 실시간 매매가 가능합니다. 낮은 보수와 분산투자 효과가 장점입니다.",
  "ELS": "ELS(주가연계증권)는 기초자산 주가에 연동된 구조화 상품입니다. 조기상환 조건 충족 시 약정수익을 지급하며, 원금손실 구간이 존재합니다.",
  "채권": "채권은 국채·회사채·금융채 등 고정수익 상품입니다. 만기 보유 시 확정이자를 수취하며 주식 대비 안정성이 높습니다.",
  "펀드": "공모펀드는 주식형·채권형·혼합형으로 구분되며 전문 운용사가 운용합니다. 가입 전 투자설명서를 반드시 확인하세요.",
  "ISA": "ISA(개인종합자산관리계좌)는 예·적금, 펀드, ETF, ELS 등을 한 계좌에서 운용하고 순이익 200만 원(서민형 400만 원)까지 비과세 혜택을 받는 절세 상품입니다.",
  "연금저축": "연금저축은 노후 준비와 세액공제(연 600만 원 한도, 최대 16.5%)를 동시에 받을 수 있는 장기 투자 상품입니다. 만 55세 이후 연금 수령이 가능합니다."
};

exports.handler = async (event) => {
  const intentName = event.sessionState?.intent?.name;
  const slots = event.sessionState?.intent?.slots || {};
  const sessionAttrs = event.sessionState?.sessionAttributes || {};

  // ─── BookConsultation ───────────────────────────────────────────────────────
  if (intentName === "BookConsultation") {
    const branch      = getSlotValue(slots, "Branch");
    const productType = getSlotValue(slots, "ProductType");
    const date        = getSlotValue(slots, "Date");
    const time        = getSlotValue(slots, "Time");
    const name        = getSlotValue(slots, "CustomerName");
    const phone       = getSlotValue(slots, "PhoneNumber");

    const consultationId = `C-${Date.now().toString(36).toUpperCase()}`;

    const newSessionAttrs = {
      ...sessionAttrs,
      lastConsultationId: consultationId,
      lastConsultationSummary: JSON.stringify({ consultationId, branch, productType, date, time, name, phone })
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
          content: `투자상담 예약이 완료되었습니다.\n예약번호: ${consultationId}\n지점: ${branch || "미지정"} / 상품: ${productType || "미지정"} / 일시: ${date || "날짜 미정"} ${time || ""}\n담당 PB가 방문 전날 ${phone || "연락처 미입력"}으로 사전 연락드립니다.`
        }
      ]
    };
  }

  // ─── CheckConsultation ──────────────────────────────────────────────────────
  if (intentName === "CheckConsultation") {
    const consultationId = getSlotValue(slots, "ConsultationId") || sessionAttrs.lastConsultationId;

    if (!consultationId) {
      return close(event, "Failed", "조회할 예약번호를 찾지 못했어요. 예약번호(예: C-ABCD12)를 알려주세요.");
    }

    const summaryRaw = sessionAttrs.lastConsultationSummary;
    if (summaryRaw) {
      try {
        const s = JSON.parse(summaryRaw);
        if (s.consultationId === consultationId) {
          return close(
            event, "Fulfilled",
            `예약 조회 결과\n예약번호: ${consultationId}\n지점: ${s.branch || "-"} / 상품: ${s.productType || "-"} / 일시: ${s.date || "-"} ${s.time || ""}\n고객명: ${s.name || "-"}`
          );
        }
      } catch (_) {}
    }

    return close(event, "Fulfilled", `예약번호 ${consultationId}로 등록된 상담 예약을 찾지 못했어요(데모 환경).`);
  }

  // ─── CancelConsultation ─────────────────────────────────────────────────────
  if (intentName === "CancelConsultation") {
    const consultationId = getSlotValue(slots, "ConsultationId") || sessionAttrs.lastConsultationId;

    if (!consultationId) {
      return close(event, "Failed", "취소할 예약번호를 찾지 못했어요. 예약번호(예: C-ABCD12)를 알려주세요.");
    }

    const newSessionAttrs = { ...sessionAttrs, lastCancelledConsultationId: consultationId };
    return {
      sessionState: {
        ...event.sessionState,
        intent: { ...event.sessionState.intent, state: "Fulfilled" },
        sessionAttributes: newSessionAttrs
      },
      messages: [{ contentType: "PlainText", content: `예약번호 ${consultationId} 투자상담 예약이 취소되었습니다. 다시 예약을 원하시면 '상담 예약'이라고 말씀해 주세요.` }]
    };
  }

  // ─── ProductInfo ────────────────────────────────────────────────────────────
  if (intentName === "ProductInfo") {
    const productType = getSlotValue(slots, "ProductType");
    if (!productType) {
      return close(event, "Fulfilled", "어떤 금융상품이 궁금하세요? 예: 국내주식, 해외주식, ETF, ELS, 채권, 펀드, ISA, 연금저축");
    }
    const info = PRODUCT_INFO[productType];
    if (info) {
      return close(event, "Fulfilled", `[${productType}]\n${info}\n\n더 자세한 상담을 원하시면 '투자상담 예약'을 요청해 주세요.`);
    }
    return close(event, "Fulfilled", `${productType}에 대한 상세 안내는 가까운 지점 PB에게 문의하시거나 '투자상담 예약'을 이용해 주세요.`);
  }

  // ─── Help ────────────────────────────────────────────────────────────────────
  if (intentName === "Help") {
    return close(
      event, "Fulfilled",
      "안녕하세요! 금융투자 상담 챗봇입니다.\n\n" +
      "이용 가능한 기능:\n" +
      "• 투자상담 예약 - \"여의도지점 ETF 상담 예약해줘\"\n" +
      "• 예약 조회      - \"내 상담 예약 확인해줘\"\n" +
      "• 예약 취소      - \"상담 예약 취소하고 싶어요\"\n" +
      "• 상품 안내      - \"ETF가 뭐야\", \"ISA 계좌 혜택 알려줘\"\n\n" +
      "※ 투자는 원금 손실이 발생할 수 있으며, 투자 결정은 고객 본인의 판단과 책임 하에 이루어집니다."
    );
  }

  // ─── Fallback ────────────────────────────────────────────────────────────────
  return close(
    event, "Fulfilled",
    "죄송합니다, 말씀을 잘 이해하지 못했어요.\n'상담 예약', '예약 조회', '예약 취소', '상품 안내' 중 하나로 다시 말씀해 주시거나, '도움말'을 입력해 주세요."
  );
};
