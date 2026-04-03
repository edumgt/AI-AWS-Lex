# Amazon Lex V2 개념 정리 (Intent / Slot / Locale / Alias)

## 1. Bot
**Bot(봇)**은 전체 챗봇 애플리케이션입니다.  
사용자와 대화하면서 질문을 이해하고, 필요한 값을 받고, 결과를 반환하는 전체 시스템 단위입니다.

- Lex V2에서 모든 구성요소는 Bot 안에 포함됨
- Intent, Slot, Locale 등이 모두 Bot 내부 구성요소

---

## 2. Intent
**Intent(인텐트)**는 사용자의 **의도**입니다.  
사용자가 무엇을 하려고 하는지를 의미합니다.

### 예시
- "회의실 예약해줘" → `ReserveMeetingRoom`
- "주문 상태 확인" → `CheckOrderStatus`
- "비밀번호 변경" → `ChangePassword`

### 핵심
- 사용자 발화를 분석해서 어떤 Intent인지 판단
- Sample Utterance(샘플 문장)를 기반으로 학습

---

## 3. Slot
**Slot(슬롯)**은 Intent를 처리하기 위해 필요한 **입력 값(파라미터)**입니다.

### 예시 (항공권 예약)
- 출발지
- 도착지
- 날짜
- 인원수

### 핵심
- Intent = 무엇을 할지  
- Slot = 그 일을 하기 위한 데이터
- 값이 없으면 사용자에게 질문하여 채움

---

## 4. Locale
**Locale(로케일)**은 봇의 **언어 및 지역 설정**입니다.

### 예시
- `ko_KR` → 한국어 (대한민국)
- `en_US` → 영어 (미국)
- `ja_JP` → 일본어 (일본)

### 특징
- 언어별로 Intent / 발화 / 응답 별도 구성 가능
- 다국어 챗봇 구현 가능

---

## 5. Alias
**Alias(앨리어스)**는 특정 Bot 버전을 가리키는 **별칭**입니다.

### 예시
- `DEV` → 개발용
- `BETA` → 테스트용
- `PROD` → 운영용

### 핵심
- 실제 서비스에서는 버전 대신 Alias 사용
- 운영 중에도 버전 교체 가능 (무중단 배포 가능)

---

## 전체 구조 요약

| 구성요소 | 의미 |
|----------|------|
| Bot | 챗봇 전체 |
| Intent | 사용자 의도 |
| Slot | 입력 값 (파라미터) |
| Locale | 언어/지역 |
| Alias | 버전 별칭 |

---

## 예시: 병원 예약 챗봇

- **Bot**: 병원 예약 시스템
- **Intent**:
  - 진료예약
  - 예약조회
  - 예약취소
- **Slot**:
  - 진료과
  - 예약일
  - 환자명
  - 연락처
- **Locale**:
  - ko_KR
  - en_US
- **Alias**:
  - DEV
  - PROD

---

## 설계 및 빌드 흐름

1. Bot 생성
2. Intent 정의 (사용자 의도 구분)
3. Slot 정의 (필요 데이터 정의)
4. Sample Utterance 작성
5. Locale 설정 (언어)
6. Bot Build 수행
7. Version 생성
8. Alias 연결 (배포)

---

## 한 줄 정리

- Bot = 챗봇 전체  
- Intent = 사용자의 목적  
- Slot = 필요한 입력값  
- Locale = 언어 설정  
- Alias = 배포 버전 연결  

---