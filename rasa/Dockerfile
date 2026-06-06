# Rasa 챗봇 서버 이미지
# 학습된 모델을 포함해 빌드하거나, 볼륨 마운트로 모델을 제공할 수 있습니다.
FROM rasa/rasa:3.6.21-full

WORKDIR /app

# 프로젝트 파일 복사
COPY config.yml domain.yml endpoints.yml credentials.yml ./
COPY data/ ./data/

USER root

# 헬스체크용 curl 설치
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

USER 1001

EXPOSE 5005

CMD ["run", "--enable-api", "--cors", "*", "--debug"]
