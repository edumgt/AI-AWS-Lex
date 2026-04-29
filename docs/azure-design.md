# Azure CLU 설계표 (학원 예약/상담 도메인)

AWS Lex V2의 `docs/lex-design.md` 와 동일한 비즈니스 도메인을  
Azure Conversational Language Understanding(CLU) 기준으로 설계합니다.

---

## 1) 인텐트 목록

| Intent | 목적 | Fulfillment | 필수 엔티티 |
|---|---|---|---|
| MakeReservation | 수강 예약 생성 | Azure Functions (fulfillment.js) | Branch, CourseName, Date, Time, StudentName, PhoneNumber |
| CheckReservation | 예약 조회 | Azure Functions (fulfillment.js) | ReservationId |
| CancelReservation | 예약 취소 | Azure Functions (fulfillment.js) | ReservationId |
| CourseInfo | 과정/수업 정보 문의 | Azure Functions (fulfillment.js) | CourseName (선택) |
| Help | 기능 안내/도움말 | Azure Functions (fulfillment.js) | - |
| None | 미인식 발화 처리 | CLU 기본 | - |

---

## 2) 엔티티(Entity) 정의

AWS Lex의 Slot에 해당합니다.  
CLU는 Prebuilt / List / Regex / Learned 4가지 타입을 지원합니다.

### MakeReservation 엔티티

| 엔티티 | CLU 타입 | 예시 | 필수 | 비고 |
|---|---|---|---|---|
| Branch | List | 강남점, 홍대점, 잠실점, 분당점, 인천점 | Y | synonyms 포함 |
| CourseName | List | 토익, 오픽, 영어회화, 일본어, 자격증 | Y | synonyms 포함 |
| Date | Prebuilt (DateTime) | 2026-05-10, 다음 주 월요일 | Y | - |
| Time | Prebuilt (DateTime) | 19:00, 오후 7시 | Y | - |
| StudentName | Prebuilt (PersonName) | 김도영 | Y | - |
| PhoneNumber | Regex | `\d{3}-\d{3,4}-\d{4}` | Y | 정규식 검증 |

### CheckReservation / CancelReservation 엔티티

| 엔티티 | CLU 타입 | 예시 | 필수 |
|---|---|---|---|
| ReservationId | Regex | `R-[A-Z0-9]+` | N (세션 대체 가능) |

---

## 3) List 엔티티 상세 (Synonyms 포함)

### Branch

| 정규값 | 동의어(Synonyms) |
|---|---|
| 강남점 | 강남, 강남역, 강남지점 |
| 홍대점 | 홍대, 홍익대, 홍대입구 |
| 잠실점 | 잠실, 잠실역, 잠실지점 |
| 분당점 | 분당, 성남, 판교 |
| 인천점 | 인천, 인천지점 |

### CourseName

| 정규값 | 동의어(Synonyms) |
|---|---|
| 토익 | TOEIC, toeic, 토익반 |
| 오픽 | OPIc, opic, 오픽반 |
| 영어회화 | 회화, 영어, 영어수업, 영어클래스 |
| 일본어 | 일본어 수업, 일어 |
| 자격증 | 자격증반, 자격시험 |

---

## 4) CLU 콘솔 설정 체크리스트

1. Language Studio → [새 프로젝트] → [대화형 언어 이해]
2. 프로젝트 언어: `Korean (ko)` 선택
3. 인텐트(Intent) 생성 (위 표 참고)
4. 엔티티(Entity) 생성 (타입 및 synonyms 설정)
5. 각 인텐트에 Utterance(발화) 추가 및 엔티티 레이블링
6. **[학습(Train)]** → 학습 작업 완료 대기
7. **[평가(Evaluate)]** → 정밀도/재현율 확인
8. **[배포(Deploy)]** → 배포 이름: `production`
9. 환경변수 설정 후 서버 실행 (`azure/server/index.js`)

---

## 5) AWS Lex vs Azure CLU 설계 비교

| 항목 | AWS Lex V2 | Azure CLU |
|---|---|---|
| 의도 단위 | Intent | Intent |
| 파라미터 단위 | Slot | Entity |
| 내장 타입 | AMAZON.Date, AMAZON.Time, AMAZON.Person | Prebuilt DateTime, PersonName 등 |
| 커스텀 타입 | Custom Slot Type (값 목록) | List Entity (Synonyms 지원) |
| 정규식 타입 | - | Regex Entity |
| 학습 발화 | Sample Utterance | Utterance + Entity Labeling |
| 배포 단위 | Bot Alias | Deployment |
| 대화 흐름 관리 | Lex 자체 (Slot elicitation) | 애플리케이션 코드에서 관리 |

---

## 6) 발화 예시 (인텐트별)

`docs/utterances-100.md` 의 발화를 그대로 CLU에 활용할 수 있습니다.  
아래는 인텐트별 대표 발화 예시입니다.

### MakeReservation
- "강남점 토익 예약하고 싶어요"
- "홍대점에서 오픽 수업 신청하려고요"
- "5월 10일 오후 7시 영어회화 예약 부탁드려요"
- "잠실점 자격증 과정 등록하고 싶습니다"

### CheckReservation
- "제 예약 확인해 주세요"
- "R-ABC123 예약 상태 알고 싶어요"
- "예약한 날짜가 언제였나요?"

### CancelReservation
- "예약 취소하고 싶어요"
- "R-ABC123 취소해 주세요"
- "다음 주 예약 없애 주세요"

### CourseInfo
- "토익 과정 어떻게 되나요?"
- "오픽 수업 방식이 궁금해요"
- "일본어 수업 주 몇 회인가요?"

### Help
- "뭘 할 수 있나요?"
- "도움이 필요해요"
- "어떤 기능이 있어요?"
