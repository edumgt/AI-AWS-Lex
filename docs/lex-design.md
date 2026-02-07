# Lex V2 설계표 (학원 예약/상담 도메인)

## 1) 인텐트 목록
| Intent | 목적 | Fulfillment | 필수 슬롯 |
|---|---|---|---|
| MakeReservation | 상담/수강 예약 생성 | Lambda(Fulfillment) | Branch, CourseName, Date, Time, StudentName, PhoneNumber |
| CheckReservation | 예약 조회 | Lambda(Fulfillment) | ReservationId(또는 세션 내 lastReservationId) |
| CancelReservation | 예약 취소 | Lambda(Fulfillment) | ReservationId(또는 세션 내 lastReservationId) |
| CourseInfo | 과정/수업 정보 문의 | Lambda(Fulfillment) | CourseName(선택) |
| Help | 기능 안내/도움말 | Lambda(Fulfillment) | - |
| FallbackIntent | 미인식 발화 처리 | Lex 기본 | - |

> 운영에서는 `FallbackIntent`를 Lex 기본 기능으로 활성화하고, Help/Fallback 메시지를 다듬는 것을 권장합니다.

## 2) 슬롯 정의(권장)
### MakeReservation
| Slot | 타입 | 예시 | 필수 | 노트 |
|---|---|---|---|---|
| Branch | Custom(BranchType) | 강남점/홍대점/잠실점 | Y | 지점 사전(커스텀 슬롯타입) |
| CourseName | Custom(CourseType) | 토익/회화/자격증 | Y | 과정 사전(커스텀 슬롯타입) |
| Date | AMAZON.Date | 2026-02-10 | Y | 날짜 |
| Time | AMAZON.Time | 19:30 | Y | 시간 |
| StudentName | AMAZON.Person | 김도영 | Y | 이름 |
| PhoneNumber | AMAZON.PhoneNumber | 010-1234-5678 | Y | 연락처 |

### Check/Cancel
| Slot | 타입 | 예시 | 필수 |
|---|---|---|---|
| ReservationId | AMAZON.AlphaNumeric | R-ABC123 | N(세션 대체 가능) |

## 3) 커스텀 슬롯타입 예시
### BranchType
- 강남점
- 홍대점
- 잠실점
- 분당점
- 인천점

### CourseType
- 토익
- 오픽
- 영어회화
- 일본어
- 자격증

## 4) Lex 콘솔 설정 체크리스트
1. Bot 생성 → Locale: `Korean (ko_KR)` 선택
2. Intent 생성 및 Sample utterances 입력
3. Slot 생성 (MakeReservation는 슬롯 수집 플로우 중요)
4. Bot build
5. **Alias 생성(DEV/PROD 권장)** → Alias에 Lambda 연결
6. Lambda 권한: Lex가 Lambda를 호출할 수 있도록 리소스 기반 권한/트리거 확인
7. CloudWatch Logs 활성화(문제 분석용)

## 5) Lambda 연결 팁
- Alias 단위로 Lambda를 연결하면 **버전/앨리어스 기반 배포**가 쉬워집니다.
- DEV alias로 테스트 후, PROD alias로 승격(버전 스냅샷)하는 흐름을 권장합니다.

