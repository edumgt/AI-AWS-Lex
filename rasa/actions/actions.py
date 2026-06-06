"""
어학원 예약 챗봇 커스텀 액션 (Rasa SDK)

액션 목록:
  - validate_reservation_form  : 폼 슬롯 검증
  - action_complete_reservation: 예약 완료 처리 및 예약번호 발급
  - action_check_reservation   : 예약 확인 (메모리 내 세션 스토어)
  - action_cancel_reservation  : 예약 취소
"""

import random
import string
from typing import Any, Dict, List, Optional, Text

from rasa_sdk import Action, FormValidationAction, Tracker
from rasa_sdk.events import AllSlotsReset, SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.types import DomainDict

VALID_BRANCHES = ["강남점", "홍대점", "잠실점", "분당점", "인천점"]
VALID_COURSES  = ["토익", "오픽", "영어회화", "일본어", "자격증"]

# 메모리 예약 스토어 (프로덕션에서는 DB/Redis 사용)
reservation_store: Dict[str, Dict] = {}


def _gen_id() -> str:
    return "R-" + "".join(random.choices(string.digits, k=5))


def _normalize_branch(text: str) -> Optional[str]:
    for b in VALID_BRANCHES:
        if b in text or b.replace("점", "") in text:
            return b
    return None


def _normalize_course(text: str) -> Optional[str]:
    for c in VALID_COURSES:
        if c in text:
            return c
    return None


class ValidateReservationForm(FormValidationAction):
    def name(self) -> Text:
        return "validate_reservation_form"

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
                 "강남점, 홍대점, 잠실점, 분당점, 인천점 중 선택해 주세요."
        )
        return {"branch": None}

    def validate_course(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        normalized = _normalize_course(slot_value or "")
        if normalized:
            return {"course": normalized}
        dispatcher.utter_message(
            text=f"'{slot_value}'은(는) 개설되지 않은 과정입니다.\n"
                 "토익, 오픽, 영어회화, 일본어, 자격증 중 선택해 주세요."
        )
        return {"course": None}

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


class ActionCompleteReservation(Action):
    def name(self) -> Text:
        return "action_complete_reservation"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        branch = tracker.get_slot("branch")
        course = tracker.get_slot("course")
        date   = tracker.get_slot("date")
        time   = tracker.get_slot("time")
        name   = tracker.get_slot("name")
        phone  = tracker.get_slot("phone")

        reservation_id = _gen_id()
        reservation_store[reservation_id] = {
            "id": reservation_id,
            "branch": branch,
            "course": course,
            "date": date,
            "time": time,
            "name": name,
            "phone": phone,
        }

        dispatcher.utter_message(
            text=(
                f"예약이 완료되었습니다!\n\n"
                f"예약번호: {reservation_id}\n"
                f"지점: {branch}\n"
                f"과정: {course}\n"
                f"날짜: {date}\n"
                f"시간: {time}\n"
                f"예약자: {name}\n"
                f"연락처: {phone}\n\n"
                f"궁금하신 점이 있으면 언제든지 문의해 주세요."
            )
        )
        return [AllSlotsReset()]


class ActionCheckReservation(Action):
    def name(self) -> Text:
        return "action_check_reservation"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        text = tracker.latest_message.get("text", "")

        # 예약번호 패턴 탐색 (R-XXXXX)
        import re
        match = re.search(r"R-\d{5}", text)
        if match:
            rid = match.group()
            info = reservation_store.get(rid)
            if info:
                dispatcher.utter_message(
                    text=(
                        f"예약 정보입니다:\n\n"
                        f"예약번호: {info['id']}\n"
                        f"지점: {info['branch']}\n"
                        f"과정: {info['course']}\n"
                        f"날짜: {info['date']}\n"
                        f"시간: {info['time']}\n"
                        f"예약자: {info['name']}\n"
                        f"연락처: {info['phone']}"
                    )
                )
                return []
            else:
                dispatcher.utter_message(
                    text=f"예약번호 {rid}에 해당하는 예약을 찾지 못했습니다."
                )
                return []

        dispatcher.utter_message(
            text="예약번호(예: R-12345)를 알려주시면 조회해 드리겠습니다."
        )
        return []


class ActionCancelReservation(Action):
    def name(self) -> Text:
        return "action_cancel_reservation"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        text = tracker.latest_message.get("text", "")

        import re
        match = re.search(r"R-\d{5}", text)
        if match:
            rid = match.group()
            if rid in reservation_store:
                info = reservation_store.pop(rid)
                dispatcher.utter_message(
                    text=(
                        f"예약이 취소되었습니다.\n\n"
                        f"취소된 예약번호: {rid}\n"
                        f"예약자: {info['name']}\n"
                        f"과정: {info['course']} ({info['branch']})"
                    )
                )
                return []
            else:
                dispatcher.utter_message(
                    text=f"예약번호 {rid}에 해당하는 예약을 찾지 못했습니다."
                )
                return []

        dispatcher.utter_message(
            text="취소할 예약번호(예: R-12345)를 알려주시면 처리해 드리겠습니다."
        )
        return []
