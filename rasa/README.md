# Rasa ML NLU 챗봇 실습 패키지 (학원 예약/상담 도메인)

**Rasa Open Source**를 사용해 ML 기반 NLU와 대화 관리를 구현합니다.  
학원 예약/상담 도메인을 한국어 학습 데이터로 훈련시킵니다.

---

## 아키텍처 개요

```
사용자 브라우저
    │ POST /api/chat  (engine: "rasa")
    ▼
lex-chat-ux (프론트엔드, :9000)
    │ proxy /api → localhost:3000
    ▼
server/index.js (메인 라우터, :3000)
    │ engine=rasa → http://localhost:3300/chat
    ▼
rasa/server/index.js (어댑터, :3300)
    │ POST /webhooks/rest/webhook
    ▼
Rasa 서버 (:5005)   ←→   커스텀 액션 서버 (:5055)
    │
Rasa NLU + Core (학습된 모델)
```

---

## 기술 스택

| 컴포넌트 | 역할 |
|---|---|
| Rasa Open Source 3.6 | NLU (인텐트/엔티티) + Core (대화 관리) |
| Python Actions Server | 예약 완료, 확인, 취소 등 커스텀 로직 |
| Node.js Adapter | REST 포맷 변환 (프론트엔드 ↔ Rasa) |
| Docker Compose | 전체 스택 원클릭 실행 |

---

## 프로젝트 구조

```
rasa/
├── config.yml           # NLU 파이프라인 + 대화 정책
├── domain.yml           # 인텐트, 엔티티, 슬롯, 응답, 폼 정의
├── endpoints.yml        # 액션 서버 엔드포인트
├── credentials.yml      # REST 채널 설정
├── Dockerfile           # Rasa 서버 이미지
├── Dockerfile.actions   # 액션 서버 이미지
├── docker-compose.yml   # 전체 스택 실행
├── data/
│   ├── nlu.yml          # 한국어 NLU 학습 데이터 (인텐트/엔티티 예문)
│   ├── stories.yml      # 대화 시나리오
│   └── rules.yml        # 결정론적 규칙
├── actions/
│   ├── actions.py       # 커스텀 액션 (예약 처리)
│   └── requirements.txt
└── server/
    ├── index.js         # Node.js 어댑터 (포트 3300)
    ├── rasaClient.js    # Rasa REST API 클라이언트
    └── package.json
```

---

## 1) 빠른 시작 (Docker Compose)

### 1-1. 사전 요구사항

- Docker 20+ 및 Docker Compose v2+
- 여유 메모리 4GB 이상 (Rasa 훈련 시 필요)

### 1-2. 모델 학습 및 서버 실행

```bash
cd rasa

# 1. 모델 학습 (최초 1회 또는 데이터 변경 시)
docker run --rm \
  -v $(pwd):/app \
  rasa/rasa:3.6.21-full \
  train --domain /app/domain.yml --data /app/data --config /app/config.yml --out /app/models

# 2. 전체 스택 실행 (Rasa + Actions + Node.js Adapter)
docker compose up
```

서비스 포트:
| 서비스 | 포트 |
|---|---|
| Rasa 서버 | 5005 |
| 액션 서버 | 5055 |
| Node.js 어댑터 | 3300 |

### 1-3. 헬스체크

```bash
# Rasa 서버 상태
curl http://localhost:5005/

# 어댑터 서버 상태
curl http://localhost:3300/health
```

---

## 2) 로컬 직접 실행 (Python 환경)

### 2-1. Rasa 설치

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install rasa==3.6.21
```

### 2-2. 모델 학습

```bash
cd rasa
rasa train
```

학습이 완료되면 `rasa/models/` 디렉터리에 `.tar.gz` 파일이 생성됩니다.

### 2-3. 액션 서버 실행 (별도 터미널)

```bash
cd rasa
pip install rasa-sdk
rasa run actions
```

### 2-4. Rasa 서버 실행 (별도 터미널)

```bash
cd rasa
rasa run --enable-api --cors "*"
```

### 2-5. Node.js 어댑터 실행 (별도 터미널)

```bash
cd rasa/server
npm install
node index.js
```

---

## 3) API 사용 예시

### 3-1. 어댑터 서버 직접 호출

```bash
# 예약 시작
curl -s http://localhost:3300/chat \
  -H 'Content-Type: application/json' \
  -d '{"text":"강남점 토익 예약하고 싶어요","sessionId":"demo-user-001"}' | jq .
```

응답 예시:
```json
{
  "messages": ["어느 지점을 원하시나요?\n• 강남점  • 홍대점  • 잠실점  • 분당점  • 인천점"],
  "sessionId": "demo-user-001",
  "platform": "rasa",
  "raw": [{ "recipient_id": "demo-user-001", "text": "..." }]
}
```

### 3-2. 프론트엔드에서 Rasa 엔진 선택

1. 챗봇 우측 상단 ⚙️ 설정 버튼 클릭
2. 엔진 목록에서 **Rasa (ML NLU)** 선택
3. 대화 시작

---

## 4) NLU 파이프라인 설명 (`config.yml`)

```yaml
pipeline:
  - WhitespaceTokenizer       # 공백 기준 토큰화 (한국어 기본)
  - RegexFeaturizer           # 정규식 기반 특징 추출 (전화번호, 날짜)
  - LexicalSyntacticFeaturizer
  - CountVectorsFeaturizer    # 단어 빈도 벡터
  - CountVectorsFeaturizer    # 문자 n-gram 벡터 (한국어 형태소 보완)
    analyzer: char_wb
    min_ngram: 1
    max_ngram: 4
  - DIETClassifier            # Dual Intent and Entity Transformer
  - EntitySynonymMapper       # 엔티티 동의어 처리 (강남 → 강남점)
  - FallbackClassifier        # 낮은 신뢰도 발화 폴백 처리
```

> **한국어 성능 개선 팁**: `HFTransformersNLP` + `LanguageModelFeaturizer`를 추가하고  
> `klue/bert-base` 모델을 사용하면 인텐트/엔티티 정확도가 크게 향상됩니다.  
> (추가 GPU/메모리 자원 필요)

---

## 5) 커스텀 액션 확장 (`actions/actions.py`)

예약 데이터를 실제 DB에 저장하려면 `actions.py`의 스토어를 수정하세요:

```python
# 현재: 메모리 딕셔너리
reservation_store: Dict[str, Dict] = {}

# 실제 운영: PostgreSQL / MongoDB / Redis 등으로 교체
import psycopg2
# ...
```

---

## 6) 네 플랫폼 비교 요약

| 항목 | AWS Lex V2 | Azure CLU | Ollama (온프렘 LLM) | **Rasa** |
|---|---|---|---|---|
| NLU 방식 | 인텐트/슬롯 | 인텐트/엔티티 | LLM 생성형 | **ML 분류기** |
| 학습 데이터 | 발화 입력 | 발화 입력 | 시스템 프롬프트 | **YAML 학습 데이터** |
| 대화 관리 | Lex 내장 | 서버 자체 구현 | 대화 이력 | **스토리/규칙 기반** |
| 서버 위치 | AWS 클라우드 | Azure 클라우드 | 온프렘 | **온프렘/자체 서버** |
| 비용 | 요청 수 과금 | 요청 수 과금 | 서버 비용 | **무료 오픈소스** |
| 커스터마이징 | 제한적 | 제한적 | 프롬프트 | **완전 자유** |
| GPU 필요 | X | X | O (권장) | X (CPU로 충분) |
| 초기 설정 | 중간 | 중간 | 낮음 | **중간~높음** |

---

## 7) 참고 링크

- [Rasa 공식 문서](https://rasa.com/docs/rasa/)
- [Rasa GitHub](https://github.com/RasaHQ/rasa)
- [Rasa Forms (슬롯 수집)](https://rasa.com/docs/rasa/forms)
- [DIETClassifier 논문](https://arxiv.org/abs/2004.09936)
- [한국어 Rasa 설정 가이드](https://rasa.com/docs/rasa/nlu-training-data)
