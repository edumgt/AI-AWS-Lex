"""
금융투자 상담 예약 챗봇 커스텀 액션 (Rasa SDK)

intents: help, book_consultation, check_consultation, cancel_consultation, product_info
형식:    seed-testcases.json (finance-investment-consultation 도메인) 기준
"""

import re
import random
import string
from typing import Any, Dict, List, Optional, Text

from rasa_sdk import Action, FormValidationAction, Tracker
from rasa_sdk.events import AllSlotsReset, SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.types import DomainDict

VALID_BRANCHES = ["강남WM센터", "여의도지점", "압구정PB센터", "종로지점", "판교지점"]
VALID_PRODUCTS = ["국내주식", "해외주식", "ETF", "ELS", "채권", "펀드", "ISA", "연금저축"]

# 메모리 예약 스토어 (프로덕션에서는 DB/Redis 사용)
reservation_store: Dict[str, Dict] = {}
# 세션별 마지막 예약번호 추적
session_last_reservation: Dict[str, str] = {}


def _gen_id() -> str:
    chars = string.ascii_uppercase + string.digits
    return "C-" + "".join(random.choices(chars, k=6))


def _normalize_branch(text: str) -> Optional[str]:
    aliases = {
        "강남": "강남WM센터", "강남WM": "강남WM센터",
        "여의도": "여의도지점",
        "압구정": "압구정PB센터", "압구정PB": "압구정PB센터",
        "종로": "종로지점",
        "판교": "판교지점",
    }
    for b in VALID_BRANCHES:
        if b in text:
            return b
    for alias, branch in aliases.items():
        if alias in text:
            return branch
    return None


def _normalize_product(text: str) -> Optional[str]:
    for p in VALID_PRODUCTS:
        if p in text:
            return p
    return None


def _is_last_reservation_request(text: str) -> bool:
    keywords = ["방금", "마지막", "최근", "직전", "아까"]
    return any(k in text for k in keywords)


def _find_reservation_id(text: str) -> Optional[str]:
    match = re.search(r"C-[A-Z0-9]{5,6}", text)
    return match.group() if match else None


class ValidateConsultationForm(FormValidationAction):
    def name(self) -> Text:
        return "validate_consultation_form"

    def validate_branch(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        normalized = _normalize_branch(slot_value or "")
        if normalized:
            return {"branch": normalized}
        dispatcher.utter_message(
            text=f"'{slot_value}'은(는) 등록되지 않은 지점입니다.\n"
                 "강남WM센터, 여의도지점, 압구정PB센터, 종로지점, 판교지점 중 선택해 주세요."
        )
        return {"branch": None}

    def validate_product(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        normalized = _normalize_product(slot_value or "")
        if normalized:
            return {"product": normalized}
        dispatcher.utter_message(
            text=f"'{slot_value}'은(는) 지원하지 않는 상품입니다.\n"
                 "국내주식, 해외주식, ETF, ELS, 채권, 펀드, ISA, 연금저축 중 선택해 주세요."
        )
        return {"product": None}

    def validate_phone(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        cleaned = (slot_value or "").replace("-", "").replace(" ", "")
        if cleaned.startswith("010") and len(cleaned) == 11 and cleaned.isdigit():
            formatted = f"{cleaned[:3]}-{cleaned[3:7]}-{cleaned[7:]}"
            return {"phone": formatted}
        dispatcher.utter_message(
            text="올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)"
        )
        return {"phone": None}


class ActionCompleteConsultation(Action):
    def name(self) -> Text:
        return "action_complete_consultation"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        branch  = tracker.get_slot("branch")
        product = tracker.get_slot("product")
        date    = tracker.get_slot("date")
        time    = tracker.get_slot("time")
        name    = tracker.get_slot("name")
        phone   = tracker.get_slot("phone")

        reservation_id = _gen_id()
        reservation_store[reservation_id] = {
            "id":      reservation_id,
            "branch":  branch,
            "product": product,
            "date":    date,
            "time":    time,
            "name":    name,
            "phone":   phone,
        }
        session_last_reservation[tracker.sender_id] = reservation_id

        dispatcher.utter_message(
            text=(
                f"투자상담 예약이 완료되었습니다!\n\n"
                f"예약번호: {reservation_id}\n"
                f"지점: {branch}\n"
                f"상품: {product}\n"
                f"날짜: {date}\n"
                f"시간: {time}\n"
                f"예약자: {name}\n"
                f"연락처: {phone}\n\n"
                f"담당 PB가 상담 전날 확인 연락드립니다."
            )
        )
        return [AllSlotsReset()]


class ActionCheckConsultation(Action):
    def name(self) -> Text:
        return "action_check_consultation"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        text = tracker.latest_message.get("text", "")

        # 마지막/방금 예약 조회
        if _is_last_reservation_request(text):
            rid = session_last_reservation.get(tracker.sender_id)
            if rid and rid in reservation_store:
                info = reservation_store[rid]
                dispatcher.utter_message(
                    text=self._format_info(info)
                )
                return []
            dispatcher.utter_message(
                text="이 세션에서 예약된 상담이 없습니다. 예약번호를 알려주시면 조회해 드리겠습니다."
            )
            return []

        # 예약번호로 조회
        rid = _find_reservation_id(text)
        if rid:
            info = reservation_store.get(rid)
            if info:
                dispatcher.utter_message(text=self._format_info(info))
            else:
                dispatcher.utter_message(
                    text=f"예약번호 {rid}에 해당하는 예약을 찾지 못했습니다."
                )
            return []

        dispatcher.utter_message(
            text="예약번호(예: C-AB1234)를 알려주시면 조회해 드리겠습니다."
        )
        return []

    def _format_info(self, info: Dict) -> str:
        return (
            f"상담 예약 정보입니다:\n\n"
            f"예약번호: {info['id']}\n"
            f"지점: {info['branch']}\n"
            f"상품: {info['product']}\n"
            f"날짜: {info['date']}\n"
            f"시간: {info['time']}\n"
            f"예약자: {info['name']}\n"
            f"연락처: {info['phone']}"
        )


class ActionCancelConsultation(Action):
    def name(self) -> Text:
        return "action_cancel_consultation"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        text = tracker.latest_message.get("text", "")

        # 마지막/방금 예약 취소
        if _is_last_reservation_request(text):
            rid = session_last_reservation.get(tracker.sender_id)
            if rid and rid in reservation_store:
                info = reservation_store.pop(rid)
                del session_last_reservation[tracker.sender_id]
                dispatcher.utter_message(
                    text=(
                        f"상담 예약이 취소되었습니다.\n\n"
                        f"취소된 예약번호: {rid}\n"
                        f"예약자: {info['name']}\n"
                        f"상품: {info['product']} ({info['branch']})"
                    )
                )
                return []
            dispatcher.utter_message(
                text="이 세션에서 취소할 예약이 없습니다. 예약번호를 알려주시면 처리해 드리겠습니다."
            )
            return []

        # 예약번호로 취소
        rid = _find_reservation_id(text)
        if rid:
            if rid in reservation_store:
                info = reservation_store.pop(rid)
                if session_last_reservation.get(tracker.sender_id) == rid:
                    del session_last_reservation[tracker.sender_id]
                dispatcher.utter_message(
                    text=(
                        f"상담 예약이 취소되었습니다.\n\n"
                        f"취소된 예약번호: {rid}\n"
                        f"예약자: {info['name']}\n"
                        f"상품: {info['product']} ({info['branch']})"
                    )
                )
            else:
                dispatcher.utter_message(
                    text=f"예약번호 {rid}에 해당하는 예약을 찾지 못했습니다."
                )
            return []

        dispatcher.utter_message(
            text="취소할 예약번호(예: C-AB1234)를 알려주시면 처리해 드리겠습니다."
        )
        return []
