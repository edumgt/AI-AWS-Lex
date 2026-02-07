# Lex 자동 생성(Infra) 사용법

이 폴더에는 **Lex V2 봇을 자동 생성**하는 스크립트가 2가지 들어있습니다.

- `lex-bootstrap.sh` : AWS CLI 기반 (권장: 가장 단순/확실)
- `lex-bootstrap.js` : Node.js(AWS SDK v3) 기반

---

## 공통 준비
1) `infra/config.example.env` → `infra/config.env` 로 복사 후 값 설정

특히 아래 값은 반드시 확인하세요.

- `AWS_REGION`
- `BOT_NAME`
- `LOCALE_ID` (기본 `ko_KR`)
- `LAMBDA_ARN` (선택) : Fulfillment Lambda ARN

> `LAMBDA_ARN`을 비우면 Alias는 만들어지지만 **코드훅(Lambda)** 연결은 생략됩니다.

---

## 방법 A: AWS CLI (bash)
### 1) 의존성
- aws cli
- jq

### 2) 실행
```bash
bash infra/lex-bootstrap.sh
```

성공하면 출력에:
- `BOT_ID`
- `BOT_VERSION`
- `BOT_ALIAS_ID`
가 표시됩니다.

---

## 방법 B: Node.js (AWS SDK v3)
### 1) 의존성 설치
```bash
cd infra
npm i
```

### 2) 실행
```bash
node lex-bootstrap.js
```

---

## 실행 후 (서버 연동)
`server/`에서 아래 환경변수를 설정하고 실행하세요.

```bash
export AWS_REGION=ap-northeast-2
export LEX_BOT_ID=...
export LEX_BOT_ALIAS_ID=...
export LEX_LOCALE_ID=ko_KR
cd server
npm i
node index.js
```

테스트:
```bash
curl -s http://localhost:3000/chat -H 'Content-Type: application/json' \
  -d '{"text":"강남점 토익 예약하고 싶어요","sessionId":"demo-user-001"}' | jq .
```
