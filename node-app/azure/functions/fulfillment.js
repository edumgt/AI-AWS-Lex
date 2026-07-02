/**
 * Azure Functions Fulfillment 핸들러 (금융투자/증권사 투자상담 도메인)
 *
 * AWS Lambda fulfillment.js와 동일한 비즈니스 로직을 Azure Functions 방식으로 구현합니다.
 *
 * Azure Functions HTTP 트리거로 배포할 경우:
 *   - module.exports = { handler: azureHttpHandler }
 *   - function.json의 bindings에서 authLevel: "function" 권장
 *
 * Express 서버(azure/server/index.js)에서 직접 import해서 사용할 수도 있습니다.
 *   - handleIntent(cluResult, sessionState, rawText) → { reply, newState }
 */

// ── 엔티티 추출 헬퍼 ─────────────────────────────────────────────────────────
function getEntity(entities, name) {
  const e = entities.find(e => e.name === name);
  return e ? e.value : null;
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

// ── 인텐트별 처리 ────────────────────────────────────────────────────────────

/**
 * Express 서버에서 직접 호출하는 인텐트 디스패처
 * @param {{ intent: string, entities: Array }} cluResult
 * @param {object} sessionState - 현재 세션 상태
 * @param {string} rawText - 원본 사용자 텍스트
 * @returns {{ reply: string, newState: object }}
 */
async function handleIntent(cluResult, sessionState, rawText) {
  const { intent, entities } = cluResult;
  const state = { ...sessionState };

  if (intent === "BookConsultation") {
    const branch      = getEntity(entities, "Branch")      || state.pendingBranch;
    const productType  = getEntity(entities, "ProductType") || state.pendingProductType;
    const date         = getEntity(entities, "Date")        || state.pendingDate;
    const time         = getEntity(entities, "Time")        || state.pendingTime;
    const customerName = getEntity(entities, "CustomerName")|| state.pendingName;
    const phone        = getEntity(entities, "PhoneNumber") || state.pendingPhone;

    // 필수 슬롯 미수집 시 단계별 질문
    if (!branch)        return { reply: "어느 지점에서 상담받고 싶으세요? (여의도지점/종로지점/압구정PB센터/강남WM센터/판교지점)", newState: { ...state, intent: "BookConsultation", pendingProductType: productType, pendingDate: date, pendingTime: time, pendingName: customerName, pendingPhone: phone } };
    if (!productType)   return { reply: "어떤 상품에 관심 있으세요? (국내주식/해외주식/ETF/ELS/채권/펀드/ISA/연금저축)", newState: { ...state, intent: "BookConsultation", pendingBranch: branch, pendingDate: date, pendingTime: time, pendingName: customerName, pendingPhone: phone } };
    if (!date)          return { reply: "희망하시는 상담 날짜를 알려주세요. (예: 2026-07-15)", newState: { ...state, intent: "BookConsultation", pendingBranch: branch, pendingProductType: productType, pendingTime: time, pendingName: customerName, pendingPhone: phone } };
    if (!time)          return { reply: "희망하시는 시간을 알려주세요. (예: 19:30)", newState: { ...state, intent: "BookConsultation", pendingBranch: branch, pendingProductType: productType, pendingDate: date, pendingName: customerName, pendingPhone: phone } };
    if (!customerName)  return { reply: "예약자 성함을 알려주세요.", newState: { ...state, intent: "BookConsultation", pendingBranch: branch, pendingProductType: productType, pendingDate: date, pendingTime: time, pendingPhone: phone } };
    if (!phone)         return { reply: "연락처를 알려주세요. (예: 010-1234-5678)", newState: { ...state, intent: "BookConsultation", pendingBranch: branch, pendingProductType: productType, pendingDate: date, pendingTime: time, pendingName: customerName } };

    const consultationId = `C-${Date.now().toString(36).toUpperCase()}`;
    const newState = {
      lastConsultationId: consultationId,
      lastConsultation: { consultationId, branch, productType, date, time, customerName, phone }
    };
    return {
      reply: `투자상담 예약이 완료되었습니다.\n예약번호: ${consultationId}\n지점: ${branch} / 상품: ${productType} / 일시: ${date} ${time}\n담당 PB가 방문 전날 ${phone}으로 사전 연락드립니다.`,
      newState
    };
  }

  if (intent === "CheckConsultation") {
    const consultationId = getEntity(entities, "ConsultationId") || state.lastConsultationId;
    if (!consultationId) return { reply: "조회할 예약번호를 알려주세요. (예: C-ABCD12)", newState: state };

    const r = state.lastConsultation;
    if (r && r.consultationId === consultationId) {
      return {
        reply: `예약 조회 결과\n예약번호: ${consultationId}\n지점: ${r.branch} / 상품: ${r.productType} / 일시: ${r.date} ${r.time}\n고객명: ${r.customerName}`,
        newState: state
      };
    }
    return { reply: `예약번호 ${consultationId}로 등록된 상담 예약을 찾지 못했어요(데모 환경).`, newState: state };
  }

  if (intent === "CancelConsultation") {
    const consultationId = getEntity(entities, "ConsultationId") || state.lastConsultationId;
    if (!consultationId) return { reply: "취소할 예약번호를 알려주세요.", newState: state };

    const newState = { ...state, lastCancelledConsultationId: consultationId };
    return { reply: `예약번호 ${consultationId} 투자상담 예약이 취소되었습니다. 다시 예약을 원하시면 '상담 예약'이라고 말씀해 주세요.`, newState };
  }

  if (intent === "ProductInfo") {
    const productType = getEntity(entities, "ProductType");
    if (!productType) return { reply: "어떤 금융상품이 궁금하세요? 예: 국내주식, 해외주식, ETF, ELS, 채권, 펀드, ISA, 연금저축", newState: state };
    const info = PRODUCT_INFO[productType];
    if (info) {
      return { reply: `[${productType}]\n${info}\n\n더 자세한 상담을 원하시면 '투자상담 예약'을 요청해 주세요.`, newState: state };
    }
    return { reply: `${productType}에 대한 상세 안내는 가까운 지점 PB에게 문의하시거나 '투자상담 예약'을 이용해 주세요.`, newState: state };
  }

  if (intent === "Help") {
    return {
      reply: "가능한 기능: 투자상담 예약, 예약 조회/취소, 상품 안내. 예) '여의도지점 ETF 상담 예약해줘'",
      newState: state
    };
  }

  // FallbackIntent / None
  return {
    reply: "죄송해요, 잘 이해하지 못했어요. '상담 예약', '예약 조회', '예약 취소', '상품 안내' 중으로 다시 말씀해 주세요.",
    newState: state
  };
}

// ── Azure Functions HTTP 트리거 핸들러 ───────────────────────────────────────
/**
 * Azure Functions v4 (Node.js) 배포 시 사용하는 HTTP 트리거 핸들러.
 * function.json 없이 코드 기반 등록 방식입니다.
 *
 * 배포 방법:
 *   1. Azure Functions Core Tools 설치: npm i -g azure-functions-core-tools@4
 *   2. func init --worker-runtime node --language javascript
 *   3. 이 파일을 src/functions/fulfillment.js 에 배치
 *   4. func azure functionapp publish <app-name>
 */
const { app: funcApp } = (() => {
  try { return require("@azure/functions"); } catch { return { app: null }; }
})();

if (funcApp) {
  funcApp.http("fulfillment", {
    methods: ["POST"],
    authLevel: "function",
    handler: async (request, context) => {
      try {
        const body = await request.json();
        const { cluResult, sessionState = {}, rawText = "" } = body;
        const result = await handleIntent(cluResult, sessionState, rawText);
        return { status: 200, jsonBody: result };
      } catch (err) {
        context.error(err);
        return { status: 500, jsonBody: { error: err.message } };
      }
    }
  });
}

module.exports = { handleIntent };
