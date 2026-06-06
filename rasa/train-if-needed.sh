#!/bin/bash
# models/ 디렉터리에 학습된 모델이 없을 때만 rasa train 실행
set -e

MODEL_DIR="/models"

if ls "${MODEL_DIR}"/*.tar.gz 2>/dev/null | grep -q .; then
  echo "[rasa-train] 기존 모델 발견 — 학습을 건너뜁니다."
  ls -lh "${MODEL_DIR}"/*.tar.gz
else
  echo "[rasa-train] 학습된 모델이 없습니다. 학습을 시작합니다..."
  python3 -m rasa train \
    --domain /app/domain.yml \
    --data    /app/data \
    --config  /app/config.yml \
    --out     "${MODEL_DIR}"
  echo "[rasa-train] 학습 완료."
fi
