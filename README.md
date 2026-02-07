# Amazon Lex V2 + Node.js 실습 패키지 (학원 예약/상담 도메인)

이 레포는 **Amazon Lex V2 봇**을 만들고, **Lambda Fulfillment(Node.js)** 및 **Node.js 서버(Express)**에서
**Lex Runtime V2(RecognizeText)** 호출까지 한 번에 실습할 수 있도록 구성한 예제입니다.

- 대상 리전: `ap-northeast-2` (변경 가능)
- Node.js: 18+ 권장
- AWS SDK: JavaScript v3
- 코드 형식: CommonJS

## 0) 구성
```
lex-lab/
  server/                # Node.js API 서버: /chat → Lex 호출
    index.js
    lexClient.js
    package.json
  lambda/                # Lex Fulfillment Lambda (Node.js)
    fulfillment.js
  docs/
    lex-design.md        # 인텐트/슬롯 설계표 + 설정 가이드
    utterances-100.md    # 샘플 발화 100개
  scripts/
    seed-testcases.json  # 테스트 케이스(발화 + 기대 인텐트)
  postman/
    Lex-Lab.postman_collection.json
    Lex-Lab.postman_environment.json
```

## 1) 사전 준비
1. AWS CLI 로그인/자격증명 설정
2. Lex V2 봇 생성(콘솔) 및 **Bot ID / Bot Alias ID / Locale ID** 확인
3. Lambda Fulfillment 생성 후 Lex에 연결(가이드는 `docs/lex-design.md` 참고)

> Lex 런타임 호출용 권한이 필요합니다. (예: `lex:RecognizeText`)

## 2) 서버 실행(로컬)
### 2-1. 의존성 설치
```bash
cd server
npm i
```

### 2-2. 환경변수 설정
```bash
export AWS_REGION=ap-northeast-2
export LEX_BOT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
export LEX_BOT_ALIAS_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
export LEX_LOCALE_ID=ko_KR
```

### 2-3. 실행
```bash
node index.js
```

- 기본 포트: `3000`
- 엔드포인트: `POST http://localhost:3000/chat`

## 3) Postman으로 테스트
`postman/` 폴더의 컬렉션/환경파일을 Import 한 뒤,
환경변수에 `BASE_URL=http://localhost:3000`를 넣고 실행하세요.

## 4) Lex 콘솔에서 빠른 검증
- `docs/utterances-100.md`의 문장을 Lex 테스트 창에 입력해보세요.
- `scripts/seed-testcases.json`은 자동 테스트(스크립트화)할 때 사용하기 좋습니다.

## 5) Lambda Fulfillment 배포
`lambda/fulfillment.js`를 Lambda에 업로드하고 런타임은 Node.js 18+ 선택.

- Lex V2는 **(봇/로케일/앨리어스 단위)**로 Lambda 코드훅을 연결하는 방식이 일반적입니다.
- 연결/권한 설정 체크리스트는 `docs/lex-design.md`에 포함되어 있습니다.

---

## 라이선스
학습/실습 목적 자유롭게 사용 가능.


## 6) Lex 자동 생성(옵션)
`infra/` 폴더의 스크립트로 **Bot/Locale/Intent/Slot/Build/Alias**를 자동 생성할 수 있습니다. 자세한 사용법은 `infra/README.md`를 참고하세요.
