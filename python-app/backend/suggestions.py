"""슬롯 자동완성 제안 목록 (Node 버전 server/suggestions.js 포팅, Lex Models 조회 부분 제외)."""

from campus_locations import CAMPUS_LOCATIONS
from dialogue import PRODUCT_TYPES

BRANCH_NAMES = [c["name"] for c in CAMPUS_LOCATIONS]


def get_suggestions(slot: str) -> list[str]:
    if slot == "Branch":
        return BRANCH_NAMES
    if slot == "ProductType":
        return PRODUCT_TYPES
    return []
