# Azure CLU 설계표 (금융투자/증권사 투자상담 도메인)

AWS Lex V2의 `docs/lex-design.md` 와 동일한 비즈니스 도메인을  
Azure Conversational Language Understanding(CLU) 기준으로 설계합니다.

---

## 1) 인텐트 목록

| Intent | 목적 | Fulfillment | 필수 엔티티 |
|---|---|---|---|
| BookConsultation | 투자상담 예약 생성 | Azure Functions (fulfillment.js) | Branch, ProductType, Date, Time, CustomerName, PhoneNumber |
| CheckConsultation | 예약 조회 | Azure Functions (fulfillment.js) | ConsultationId |
| CancelConsultation | 예약 취소 | Azure Functions (fulfillment.js) | ConsultationId |
| ProductInfo | 금융상품 정보 문의 | Azure Functions (fulfillment.js) | ProductType (선택) |
| Help | 기능 안내/도움말 | Azure Functions (fulfillment.js) | - |
| None | 미인식 발화 처리 | CLU 기본 | - |

---

## 2) 엔티티(Entity) 정의

AWS Lex의 Slot에 해당합니다.  
CLU는 Prebuilt / List / Regex / Learned 4가지 타입을 지원합니다.

### BookConsultation 엔티티

| 엔티티 | CLU 타입 | 예시 | 필수 | 비고 |
|---|---|---|---|---|
| Branch | List | 여의도지점, 종로지점, 압구정PB센터, 강남WM센터, 판교지점 | Y | synonyms 포함 |
| ProductType | List | 국내주식, 해외주식, ETF, ELS, 채권, 펀드, ISA, 연금저축 | Y | synonyms 포함 |
| Date | Prebuilt (DateTime) | 2026-07-15, 다음 주 월요일 | Y | - |
| Time | Prebuilt (DateTime) | 19:30, 오후 7시 | Y | - |
| CustomerName | Prebuilt (PersonName) | 김도영 | Y | - |
| PhoneNumber | Regex | `\d{3}-\d{3,4}-\d{4}` | Y | 정규식 검증 |

### CheckConsultation / CancelConsultation 엔티티

| 엔티티 | CLU 타입 | 예시 | 필수 |
|---|---|---|---|
| ConsultationId | Regex | `C-[A-Z0-9]+` | N (세션 대체 가능) |

---

## 3) List 엔티티 상세 (Synonyms 포함)

### Branch

| 정규값 | 동의어(Synonyms) |
|---|---|
| 여의도지점 | 여의도, 여의도역, 여의도 본점 |
| 종로지점 | 종로, 종로구, 종로역 |
| 압구정PB센터 | 압구정, 압구정역, 압구정 PB |
| 강남WM센터 | 강남, 강남역, 강남 WM |
| 판교지점 | 판교, 판교역, 판교 테크 |

### ProductType

| 정규값 | 동의어(Synonyms) |
|---|---|
| 국내주식 | 국내 주식, 주식, 코스피, 코스닥 |
| 해외주식 | 해외 주식, 미국주식, 미장 |
| ETF | 이티에프, 상장지수펀드 |
| ELS | 주가연계증권, 이엘에스 |
| 채권 | 국채, 회사채, 채권형 |
| 펀드 | 공모펀드, 펀드상품 |
| ISA | 아이사, 개인종합자산관리계좌 |
| 연금저축 | 연금, 연금저축펀드 |

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

### BookConsultation
- "여의도지점 ETF 상담 예약하고 싶어요"
- "강남WM센터에서 국내주식 상담 신청하려고요"
- "7월 15일 오후 7시 30분 연금저축 상담 예약 부탁드려요"
- "판교지점 해외주식 상담 등록하고 싶습니다"

### CheckConsultation
- "제 상담 예약 확인해 주세요"
- "C-ABCD12 예약 상태 알고 싶어요"
- "예약한 날짜가 언제였나요?"

### CancelConsultation
- "상담 예약 취소하고 싶어요"
- "C-ABCD12 취소해 주세요"
- "다음 주 예약 없애 주세요"

### ProductInfo
- "ETF가 뭐예요?"
- "ISA 계좌 혜택이 궁금해요"
- "연금저축 세액공제는 얼마나 되나요?"

### Help
- "뭘 할 수 있나요?"
- "도움이 필요해요"
- "어떤 기능이 있어요?"
