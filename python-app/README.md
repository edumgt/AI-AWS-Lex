# python-app — Python + Vanilla JS 버전

기존 `lex-chat-ux/`(Vue/Quasar) + `server/`(Node.js/Lambda) 스택을 AWS 의존성 없이
**FastAPI + 순수 JS/HTML/CSS**로 재구현한 버전입니다. 기존 코드는 그대로 두고
이 디렉터리에 별도로 작성했습니다.

## 구성

```
python-app/
├── backend/
│   ├── main.py            # FastAPI 앱, /api/* 라우트 + 정적 파일 서빙
│   ├── dialogue.py         # 규칙 기반 대화 엔진 (fulfillment.js + reservationFlow.js 포팅)
│   ├── frontend_auth.py    # client-auth HMAC double-submit 토큰 (frontendAuth.js 포팅)
│   ├── suggestions.py      # 슬롯 자동완성 목록
│   ├── campus_locations.py # 지점 데이터
│   └── requirements.txt
└── frontend/
    ├── index.html          # KF증권 홈페이지
    ├── turing.html         # 튜링 테스트 페이지
    ├── css/style.css
    ├── js/{api,chat,branchMap,home,turing}.js
    └── data/campus_locations.json
```

## 실행

```bash
cd python-app/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py   # http://localhost:8000
```

프런트엔드는 FastAPI가 같은 오리진에서 정적 파일로 서빙하므로 별도 서버가 필요 없습니다.

## 기존 버전과의 차이

- **AWS 미사용**: Amazon Lex 대신 Python 규칙 기반(정규식/키워드) 대화 엔진을 사용합니다.
  Branch/ProductType/Date/Time/CustomerName/PhoneNumber 슬롯을 순서대로 채우는
  상태머신이며, 세션은 프로세스 메모리에 보관됩니다(서버 재시작 시 초기화).
- **인증**: Cognito 로그인 없이, 기존 "client-auth" 방식(HttpOnly 쿠키 + 헤더
  double-submit 토큰)만 사용합니다.
- **음성 입력 제외**: 기존 프런트가 사용하던 Amazon Transcribe 연동은 이 저장소에
  구현되어 있지 않았고 AWS 의존성이므로 이번 rewrite에서 제외했습니다.
- **튜링 테스트 게임**: 전부 클라이언트 사이드 시뮬레이션이라 백엔드 변경 없이
  그대로 포팅했습니다 (`js/turing.js`).
