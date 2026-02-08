# Lex Chat UX v2 (Node + Vanilla JS)

Amazon Lex V2 Runtime 호출 + "대화형 UX" 렌더링 예제입니다.

추가된 UX 기능(v2)
- 슬롯별 추천 버튼(Quick Replies) 자동 생성  
  - `.env`의 `BRANCH_VALUES`, `COURSE_VALUES`를 사용하거나  
  - (권한이 있으면) Lex Models API로 Bot의 SlotType(enum) 값을 읽어와 자동 생성
- "현재까지 채운 값" 요약 카드(Branch/Course/Date/Time/Name/Phone)
- 슬롯 타입에 따라 입력 폼 UX 변경  
  - Date: date 입력 UI 흉내(브라우저 지원 시)  
  - Time: time 입력 UI 흉내  
  - PhoneNumber: 간단 마스킹(010-1234-5678)
- 대화 기록(localStorage) 저장/복원 + 세션 유지

## 설치/실행
```bash
cp .env.example .env
# AWS_REGION, LEX_BOT_ID, LEX_BOT_ALIAS_ID, LEX_LOCALE_ID 설정
# (옵션) BRANCH_VALUES, COURSE_VALUES 설정

npm install
npm start
```

브라우저: http://localhost:3000

## API
- POST `/api/chat` : Lex recognizeText + UX-friendly JSON
- GET  `/api/suggestions?slot=Branch|CourseName` : quick replies 후보 목록
