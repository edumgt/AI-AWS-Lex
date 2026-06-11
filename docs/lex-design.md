# Lex V2 설계표 (금융투자/증권사 투자상담 도메인)

## 1) 인텐트 목록
| Intent | 목적 | Fulfillment | 필수 슬롯 |
|---|---|---|---|
| BookConsultation | 투자상담 예약 생성 | Lambda(Fulfillment) | Branch, ProductType, Date, Time, CustomerName, PhoneNumber |
| CheckConsultation | 상담 예약 조회 | Lambda(Fulfillment) | ConsultationId(또는 세션 내 lastConsultationId) |
| CancelConsultation | 상담 예약 취소 | Lambda(Fulfillment) | ConsultationId(또는 세션 내 lastConsultationId) |
| ProductInfo | 금융투자 상품 안내 | Lambda(Fulfillment) | ProductType(선택) |
| Help | 기능 안내/도움말 | Lambda(Fulfillment) | - |
| FallbackIntent | 미인식 발화 처리 | Lex 기본 | - |

> `FallbackIntent`는 Lex 기본 기능으로 활성화하고, Lambda fallback 메시지를 다듬어 운영 적용합니다.

## 2) 슬롯 정의

### BookConsultation
| Slot | 타입 | 예시 | 필수 | 노트 |
|---|---|---|---|---|
| Branch | Custom(BranchType) | 강남WM센터/여의도지점 | Y | 지점/WM/PB센터 사전(커스텀) |
| ProductType | Custom(ProductType) | ETF/국내주식/ISA | Y | 금융상품 유형 사전(커스텀) |
| Date | AMAZON.Date | 2026-07-15 | Y | 희망 상담 날짜 |
| Time | AMAZON.Time | 14:00 | Y | 희망 상담 시간 |
| CustomerName | AMAZON.Person | 김도영 | Y | 고객 성명 |
| PhoneNumber | AMAZON.PhoneNumber | 010-1234-5678 | Y | 연락처 |

### CheckConsultation / CancelConsultation
| Slot | 타입 | 예시 | 필수 |
|---|---|---|---|
| ConsultationId | AMAZON.AlphaNumeric | C-ABCD12 | N(세션 대체 가능) |

### ProductInfo
| Slot | 타입 | 예시 | 필수 |
|---|---|---|---|
| ProductType | Custom(ProductType) | ETF/펀드/ELS | N |

## 3) 커스텀 슬롯타입

### BranchType (증권사 지점/WM/PB센터)
- 강남WM센터
- 여의도지점
- 압구정PB센터
- 종로지점
- 판교지점

### ProductType (금융투자 상품)
- 국내주식
- 해외주식
- ETF
- ELS
- 채권
- 펀드
- ISA
- 연금저축

## 4) 주요 발화 예시

### BookConsultation
- 투자상담 예약하고 싶어요
- 여의도지점 ETF 상담 예약해줘
- 강남WM센터 국내주식 상담 7월 15일 오후 2시 예약
- 압구정PB센터 ISA 상담 예약, 이름 김도영

### CheckConsultation
- 상담 예약 조회해줘
- 예약번호 C-ABCD12 확인
- 방금 예약한 거 확인해줘
- 내 마지막 상담 예약 내용 알려줘

### CancelConsultation
- 상담 예약 취소하고 싶어요
- C-ABCD12 취소해줘
- 마지막 예약 취소해줘
- 여의도지점 상담 예약 취소

### ProductInfo
- ETF가 뭐야
- ISA 계좌 혜택 알려줘
- 연금저축 세액공제 얼마야?
- ELS 위험도 어때?
- 해외주식 수수료 알려줘

## 5) Lex 콘솔 설정 체크리스트
1. Bot 생성 → Locale: `Korean (ko_KR)` 선택
2. 커스텀 슬롯타입 생성: BranchType, ProductType
3. Intent 생성 및 Sample utterances 입력 (BookConsultation부터)
4. Slot 생성 - BookConsultation 슬롯 수집 플로우 중요
5. Bot build
6. **Alias 생성(DEV/PROD)** → Alias에 Lambda 연결
7. Lambda 권한: Lex가 Lambda를 호출할 수 있도록 리소스 기반 권한 확인
8. CloudWatch Logs 활성화

## 6) 투자 유의사항 (UI 필수 표시)
> 본 챗봇은 정보 제공 및 상담 예약 목적으로만 운영됩니다.
> 투자는 원금 손실이 발생할 수 있으며, 투자 결정은 고객 본인의 판단과 책임 하에 이루어집니다.
