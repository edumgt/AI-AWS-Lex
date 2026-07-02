"""
규칙 기반 대화 엔진 (Python 포팅).

기존 Node.js 버전의 세 파일을 하나로 합쳐 재구현했다:
- lambda/fulfillment.js            → 인텐트별 처리 로직, PRODUCT_INFO
- lex-chat-ux/server/reservationFlow.js → 슬롯 채우기 상태머신, 값 추출 정규식
- lex-chat-ux/server/lexFormatter.js    → 프런트에 내려주는 ui/summary 응답 포맷

AWS Lex 없이 동작하도록 인텐트 분류 자체를 규칙(정규식/키워드)으로 수행한다.
"""

import re
import time
from typing import Optional

from campus_locations import CAMPUS_LOCATIONS

BRANCH_NAMES = [c["name"] for c in CAMPUS_LOCATIONS]
PRODUCT_TYPES = ["국내주식", "해외주식", "ETF", "ELS", "채권", "펀드", "ISA", "연금저축"]

SLOT_ORDER = ["Branch", "ProductType", "Date", "Time", "CustomerName", "PhoneNumber"]

SLOT_LABELS = {
    "Branch": "지점",
    "ProductType": "상품",
    "Date": "날짜",
    "Time": "시간",
    "CustomerName": "고객명",
    "PhoneNumber": "연락처",
    "ConsultationId": "예약번호",
}

SLOT_PROMPTS = {
    "Branch": "어느 지점에서 상담받고 싶으세요? (예: 여의도지점)",
    "ProductType": "어떤 상품에 관심 있으세요? (예: ETF)",
    "Date": "희망하시는 상담 날짜를 알려주세요. (예: 2026-07-15)",
    "Time": "희망하시는 시간을 알려주세요. (예: 19:30)",
    "CustomerName": "예약자 성함을 알려주세요. (예: 김도영)",
    "PhoneNumber": "연락처를 알려주세요. (예: 010-1234-5678)",
}

SLOT_PLACEHOLDERS = {
    "Branch": "지점을 입력하세요 (예: 여의도지점)",
    "ProductType": "상품을 입력하세요 (예: ETF)",
    "Date": "날짜를 입력하세요 (예: 2026-07-15)",
    "Time": "시간을 입력하세요 (예: 19:30)",
    "CustomerName": "이름을 입력하세요 (예: 김도영)",
    "PhoneNumber": "연락처를 입력하세요 (예: 010-1234-5678)",
    "ConsultationId": "예약번호를 입력하세요 (예: C-ABCD12)",
}

PRODUCT_INFO = {
    "국내주식": "국내주식은 KRX에 상장된 주식을 매매하는 상품입니다. 위탁매매 수수료는 온라인 기준 0.015%이며, 실시간 HTS/MTS 거래가 가능합니다.",
    "해외주식": "해외주식은 미국·홍콩·중국·일본 등 글로벌 시장 주식을 매매합니다. 환율 리스크가 있으며 결제는 T+2 기준입니다.",
    "ETF": "ETF(상장지수펀드)는 특정 지수를 추종하는 펀드로 주식처럼 실시간 매매가 가능합니다. 낮은 보수와 분산투자 효과가 장점입니다.",
    "ELS": "ELS(주가연계증권)는 기초자산 주가에 연동된 구조화 상품입니다. 조기상환 조건 충족 시 약정수익을 지급하며, 원금손실 구간이 존재합니다.",
    "채권": "채권은 국채·회사채·금융채 등 고정수익 상품입니다. 만기 보유 시 확정이자를 수취하며 주식 대비 안정성이 높습니다.",
    "펀드": "공모펀드는 주식형·채권형·혼합형으로 구분되며 전문 운용사가 운용합니다. 가입 전 투자설명서를 반드시 확인하세요.",
    "ISA": "ISA(개인종합자산관리계좌)는 예·적금, 펀드, ETF, ELS 등을 한 계좌에서 운용하고 순이익 200만 원(서민형 400만 원)까지 비과세 혜택을 받는 절세 상품입니다.",
    "연금저축": "연금저축은 노후 준비와 세액공제(연 600만 원 한도, 최대 16.5%)를 동시에 받을 수 있는 장기 투자 상품입니다. 만 55세 이후 연금 수령이 가능합니다.",
}

HELP_MESSAGE = (
    "안녕하세요! 금융투자 상담 챗봇입니다.\n\n"
    "이용 가능한 기능:\n"
    "• 투자상담 예약 - \"여의도지점 ETF 상담 예약해줘\"\n"
    "• 예약 조회      - \"내 상담 예약 확인해줘\"\n"
    "• 예약 취소      - \"상담 예약 취소하고 싶어요\"\n"
    "• 상품 안내      - \"ETF가 뭐야\", \"ISA 계좌 혜택 알려줘\"\n\n"
    "※ 투자는 원금 손실이 발생할 수 있으며, 투자 결정은 고객 본인의 판단과 책임 하에 이루어집니다."
)

FALLBACK_MESSAGE = (
    "죄송합니다, 말씀을 잘 이해하지 못했어요.\n"
    "'상담 예약', '예약 조회', '예약 취소', '상품 안내' 중 하나로 다시 말씀해 주시거나, '도움말'을 입력해 주세요."
)

SESSION_TTL_SECONDS = 30 * 60
_SESSIONS: dict[str, dict] = {}
_CONSULTATIONS: dict[str, dict] = {}


def _get_session(session_id: str) -> dict:
    entry = _SESSIONS.get(session_id)
    now = time.time()
    if entry and (now - entry["updated_at"]) <= SESSION_TTL_SECONDS:
        return entry
    entry = {"slots": {}, "last_consultation_id": None, "updated_at": now}
    _SESSIONS[session_id] = entry
    return entry


def _touch_session(session_id: str, **updates) -> dict:
    entry = _get_session(session_id)
    entry.update(updates)
    entry["updated_at"] = time.time()
    return entry


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _extract_choice(text: str, choices: list[str]) -> Optional[str]:
    normalized = _normalize_whitespace(text)
    for choice in choices:
        if choice in normalized:
            return choice
    return None


def _clean_phone(text: str) -> Optional[str]:
    digits = re.sub(r"\D", "", text or "")
    if len(digits) == 11:
        return f"{digits[0:3]}-{digits[3:7]}-{digits[7:]}"
    if len(digits) == 10:
        return f"{digits[0:3]}-{digits[3:6]}-{digits[6:]}"
    return None


def _clean_time(text: str) -> Optional[str]:
    compact = _normalize_whitespace(text).replace(" ", "")
    match = re.match(r"^(\d{1,2}):(\d{2})$", compact)
    if match:
        hour, minute = int(match.group(1)), int(match.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return f"{hour:02d}:{minute:02d}"

    match = re.match(r"^(오전|오후)?(\d{1,2})시(?:(\d{1,2})분?)?$", compact)
    if not match:
        return None
    hour = int(match.group(2))
    minute = int(match.group(3) or "0")
    meridiem = match.group(1)
    if minute < 0 or minute > 59 or hour < 1 or hour > 12:
        return None
    if meridiem == "오후" and hour < 12:
        hour += 12
    if meridiem == "오전" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def _clean_date(text: str) -> Optional[str]:
    normalized = _normalize_whitespace(text)
    match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", normalized)
    if match:
        year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year}-{month:02d}-{day:02d}"

    match = re.match(r"^(\d{1,2})월\s*(\d{1,2})일$", normalized)
    if not match:
        return None
    month, day = int(match.group(1)), int(match.group(2))
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    year = time.localtime().tm_year
    return f"{year}-{month:02d}-{day:02d}"


def _clean_name(text: str) -> Optional[str]:
    normalized = re.sub(r"(입니다|이에요|예요|이요)$", "", _normalize_whitespace(text)).strip()
    if not normalized or re.search(r"\d", normalized) or len(normalized) > 20:
        return None
    return normalized


def _extract_slot_value(slot: str, text: str) -> Optional[str]:
    if slot == "Branch":
        return _extract_choice(text, BRANCH_NAMES)
    if slot == "ProductType":
        return _extract_choice(text, PRODUCT_TYPES)
    if slot == "Date":
        return _clean_date(text)
    if slot == "Time":
        return _clean_time(text)
    if slot == "PhoneNumber":
        return _clean_phone(text)
    if slot == "CustomerName":
        return _clean_name(text)
    return None


def _extract_all(text: str, include_name: bool) -> dict:
    detected = {}
    for slot in SLOT_ORDER:
        if slot == "CustomerName" and not include_name:
            continue
        value = _extract_slot_value(slot, text)
        if value:
            detected[slot] = value
    return detected


def _detect_product_type(text: str) -> Optional[str]:
    normalized = _normalize_whitespace(text)
    for product in PRODUCT_TYPES:
        if product in normalized:
            return product
    return None


def _extract_consultation_id(text: str) -> Optional[str]:
    match = re.search(r"C-[A-Z0-9]{4,}", (text or "").upper())
    return match.group(0) if match else None


def _get_next_missing_slot(slots: dict) -> Optional[str]:
    for slot in SLOT_ORDER:
        if not slots.get(slot):
            return slot
    return None


def _build_slots(slots: dict) -> dict:
    out = {}
    for key in SLOT_ORDER:
        value = slots.get(key)
        out[key] = None if not value else {"original": value, "interpreted": value, "resolved": [value]}
    return out


def _build_summary(slots: dict) -> list[dict]:
    return [
        {"key": key, "label": SLOT_LABELS[key], "value": slots.get(key)}
        for key in SLOT_ORDER
        if slots.get(key)
    ]


def _elicit_response(session_id: str, slots: dict, slot: str) -> dict:
    quick_replies = BRANCH_NAMES if slot == "Branch" else PRODUCT_TYPES if slot == "ProductType" else []
    prompt = SLOT_PROMPTS[slot]
    return {
        "sessionId": session_id,
        "engine": "local-rule",
        "intent": "BookConsultation",
        "state": "InProgress",
        "ui": {
            "mode": "elicit_slot",
            "slotToElicit": slot,
            "slotLabel": SLOT_LABELS[slot],
            "prompt": prompt,
            "placeholder": SLOT_PLACEHOLDERS[slot],
            "quickReplies": quick_replies,
        },
        "messages": [prompt],
        "slots": _build_slots(slots),
        "summary": _build_summary(slots),
        "raw": {"source": "local-rule", "sessionId": session_id, "slots": slots},
    }


def _close_response(session_id: str, intent: str, state: str, message: str, slots: Optional[dict] = None) -> dict:
    slots = slots or {}
    return {
        "sessionId": session_id,
        "engine": "local-rule",
        "intent": intent,
        "state": state,
        "ui": {"mode": "close", "prompt": message},
        "messages": [message],
        "slots": _build_slots(slots),
        "summary": _build_summary(slots),
        "raw": {"source": "local-rule", "sessionId": session_id, "slots": slots},
    }


def _is_reservation_intent(text: str) -> bool:
    return bool(re.search(r"(예약|상담신청|수강신청|등록)", text))


def _has_reservation_signals(detected: dict) -> bool:
    return bool(detected.get("Branch") or detected.get("ProductType") or detected.get("Date")
                or detected.get("Time") or detected.get("PhoneNumber"))


def _book_consultation(session_id: str, text: str) -> dict:
    session = _get_session(session_id)
    existing_slots = session["slots"]
    expected_slot = _get_next_missing_slot(existing_slots) if existing_slots else None
    detected = _extract_all(text, include_name=(expected_slot == "CustomerName"))

    if not existing_slots and not _is_reservation_intent(text) and not _has_reservation_signals(detected):
        return None

    slots = {**existing_slots, **detected}
    next_slot = _get_next_missing_slot(slots)

    if next_slot:
        _touch_session(session_id, slots=slots)
        return _elicit_response(session_id, slots, next_slot)

    consultation_id = f"C-{int(time.time() * 1000):X}"
    _CONSULTATIONS[consultation_id] = {"consultationId": consultation_id, **slots}
    _touch_session(session_id, slots={}, last_consultation_id=consultation_id)

    message = (
        f"투자상담 예약이 완료되었습니다.\n"
        f"예약번호: {consultation_id}\n"
        f"지점: {slots.get('Branch') or '미지정'} / 상품: {slots.get('ProductType') or '미지정'} / "
        f"일시: {slots.get('Date') or '날짜 미정'} {slots.get('Time') or ''}\n"
        f"담당 PB가 방문 전날 {slots.get('PhoneNumber') or '연락처 미입력'}으로 사전 연락드립니다."
    )
    return _close_response(session_id, "BookConsultation", "Fulfilled", message, slots)


def _check_consultation(session_id: str, text: str) -> dict:
    session = _get_session(session_id)
    consultation_id = _extract_consultation_id(text) or session.get("last_consultation_id")

    if not consultation_id:
        return _close_response(session_id, "CheckConsultation", "Failed",
                                "조회할 예약번호를 찾지 못했어요. 예약번호(예: C-ABCD12)를 알려주세요.")

    record = _CONSULTATIONS.get(consultation_id)
    if record:
        message = (
            f"예약 조회 결과\n예약번호: {consultation_id}\n"
            f"지점: {record.get('Branch') or '-'} / 상품: {record.get('ProductType') or '-'} / "
            f"일시: {record.get('Date') or '-'} {record.get('Time') or ''}\n"
            f"고객명: {record.get('CustomerName') or '-'}"
        )
        return _close_response(session_id, "CheckConsultation", "Fulfilled", message)

    return _close_response(session_id, "CheckConsultation", "Fulfilled",
                            f"예약번호 {consultation_id}로 등록된 상담 예약을 찾지 못했어요(데모 환경).")


def _cancel_consultation(session_id: str, text: str) -> dict:
    session = _get_session(session_id)
    consultation_id = _extract_consultation_id(text) or session.get("last_consultation_id")

    if not consultation_id:
        return _close_response(session_id, "CancelConsultation", "Failed",
                                "취소할 예약번호를 찾지 못했어요. 예약번호(예: C-ABCD12)를 알려주세요.")

    _CONSULTATIONS.pop(consultation_id, None)
    _touch_session(session_id, last_cancelled_consultation_id=consultation_id)
    message = f"예약번호 {consultation_id} 투자상담 예약이 취소되었습니다. 다시 예약을 원하시면 '상담 예약'이라고 말씀해 주세요."
    return _close_response(session_id, "CancelConsultation", "Fulfilled", message)


def _product_info(session_id: str, text: str) -> dict:
    product_type = _detect_product_type(text)
    if not product_type:
        return _close_response(session_id, "ProductInfo", "Fulfilled",
                                "어떤 금융상품이 궁금하세요? 예: 국내주식, 해외주식, ETF, ELS, 채권, 펀드, ISA, 연금저축")
    info = PRODUCT_INFO.get(product_type)
    if info:
        message = f"[{product_type}]\n{info}\n\n더 자세한 상담을 원하시면 '투자상담 예약'을 요청해 주세요."
        return _close_response(session_id, "ProductInfo", "Fulfilled", message)
    message = f"{product_type}에 대한 상세 안내는 가까운 지점 PB에게 문의하시거나 '투자상담 예약'을 이용해 주세요."
    return _close_response(session_id, "ProductInfo", "Fulfilled", message)


def handle_chat(text: str, session_id: str) -> dict:
    normalized = _normalize_whitespace(text)
    session = _get_session(session_id)

    # 슬롯 채우기가 진행 중이면 다른 인텐트로 분기하지 않고 이어서 받는다.
    if session["slots"]:
        result = _book_consultation(session_id, text)
        if result is not None:
            return result

    if re.search(r"(예약|상담).{0,6}취소|취소.{0,6}(예약|상담)", normalized) or normalized == "취소":
        return _cancel_consultation(session_id, text)

    if re.search(r"(예약|상담).{0,6}(조회|확인)", normalized):
        return _check_consultation(session_id, text)

    booking = _book_consultation(session_id, text)
    if booking is not None:
        return booking

    if re.search(r"도움말|사용법|help", normalized, re.IGNORECASE):
        return _close_response(session_id, "Help", "Fulfilled", HELP_MESSAGE)

    if _detect_product_type(normalized) or re.search(r"(뭐야|무엇|알려줘|설명해|궁금)", normalized):
        return _product_info(session_id, text)

    return _close_response(session_id, "Fallback", "Fulfilled", FALLBACK_MESSAGE)
