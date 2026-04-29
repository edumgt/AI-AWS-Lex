/**
 * Azure Functions Fulfillment 핸들러 (학원 예약/상담 도메인)
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

// ── 응답 생성 헬퍼 ───────────────────────────────────────────────────────────
function reply(message, state = {}) {
  return { reply: message, newState: state };
}

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

  if (intent === "MakeReservation") {
    const branch     = getEntity(entities, "Branch")      || state.pendingBranch;
    const course     = getEntity(entities, "CourseName")  || state.pendingCourse;
    const date       = getEntity(entities, "Date")        || state.pendingDate;
    const time       = getEntity(entities, "Time")        || state.pendingTime;
    const studentName = getEntity(entities, "StudentName")|| state.pendingName;
    const phone      = getEntity(entities, "PhoneNumber") || state.pendingPhone;

    // 필수 슬롯 미수집 시 단계별 질문
    if (!branch)       return { reply: "어느 지점을 원하시나요? (강남점/홍대점/잠실점/분당점/인천점)", newState: { ...state, intent: "MakeReservation", pendingCourse: course, pendingDate: date, pendingTime: time, pendingName: studentName, pendingPhone: phone } };
    if (!course)       return { reply: "어떤 과정을 예약하시겠어요? (토익/오픽/영어회화/일본어/자격증)", newState: { ...state, intent: "MakeReservation", pendingBranch: branch, pendingDate: date, pendingTime: time, pendingName: studentName, pendingPhone: phone } };
    if (!date)         return { reply: "예약 날짜를 알려주세요. (예: 2026-05-10)", newState: { ...state, intent: "MakeReservation", pendingBranch: branch, pendingCourse: course, pendingTime: time, pendingName: studentName, pendingPhone: phone } };
    if (!time)         return { reply: "예약 시간을 알려주세요. (예: 19:00)", newState: { ...state, intent: "MakeReservation", pendingBranch: branch, pendingCourse: course, pendingDate: date, pendingName: studentName, pendingPhone: phone } };
    if (!studentName)  return { reply: "예약자 성함을 알려주세요.", newState: { ...state, intent: "MakeReservation", pendingBranch: branch, pendingCourse: course, pendingDate: date, pendingTime: time, pendingPhone: phone } };
    if (!phone)        return { reply: "연락처를 알려주세요. (예: 010-1234-5678)", newState: { ...state, intent: "MakeReservation", pendingBranch: branch, pendingCourse: course, pendingDate: date, pendingTime: time, pendingName: studentName } };

    const reservationId = `R-${Date.now().toString(36).toUpperCase()}`;
    const newState = {
      lastReservationId: reservationId,
      lastReservation: { reservationId, branch, course, date, time, studentName, phone }
    };
    return {
      reply: `예약 완료! 예약번호는 ${reservationId} 입니다. (${branch} / ${course} / ${date} ${time})`,
      newState
    };
  }

  if (intent === "CheckReservation") {
    const reservationId = getEntity(entities, "ReservationId") || state.lastReservationId;
    if (!reservationId) return { reply: "조회할 예약번호를 알려주세요. (예: R-ABC123)", newState: state };

    const r = state.lastReservation;
    if (r && r.reservationId === reservationId) {
      return {
        reply: `예약 조회: ${r.branch} / ${r.course} / ${r.date} ${r.time} (예약번호 ${reservationId})`,
        newState: state
      };
    }
    return { reply: `예약번호 ${reservationId} 로 등록된 예약을 찾지 못했어요(데모 환경).`, newState: state };
  }

  if (intent === "CancelReservation") {
    const reservationId = getEntity(entities, "ReservationId") || state.lastReservationId;
    if (!reservationId) return { reply: "취소할 예약번호를 알려주세요.", newState: state };

    const newState = { ...state, lastCancelledReservationId: reservationId };
    return { reply: `예약(${reservationId}) 취소가 완료됐어요.`, newState };
  }

  if (intent === "CourseInfo") {
    const course = getEntity(entities, "CourseName");
    if (!course) return { reply: "어떤 과정이 궁금하세요? 예: 토익, 회화, 자격증", newState: state };
    return {
      reply: `${course} 과정은 주 2회/주 3회 선택 가능하고, 레벨 테스트 후 반 편성이 진행돼요(데모 안내).`,
      newState: state
    };
  }

  if (intent === "Help") {
    return {
      reply: "가능한 기능: 수강 상담, 예약, 예약 조회/취소. 예) '강남점 토익 예약하고 싶어'",
      newState: state
    };
  }

  // FallbackIntent / None
  return {
    reply: "죄송해요, 잘 이해하지 못했어요. '예약', '조회', '취소', '과정 안내' 중으로 다시 말씀해 주세요.",
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
