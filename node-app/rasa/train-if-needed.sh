#!/bin/bash
# 학습 데이터(domain.yml, data/) 변경 시 자동으로 재학습합니다.
set -e

MODEL_DIR="/models"
HASH_FILE="${MODEL_DIR}/.data_hash"

# 현재 학습 데이터의 MD5 체크섬 계산
CURRENT_HASH=$(find /app/domain.yml /app/data -type f | sort | xargs md5sum 2>/dev/null | md5sum | awk '{print $1}')

if ls "${MODEL_DIR}"/*.tar.gz 2>/dev/null | grep -q .; then
  STORED_HASH=$(cat "${HASH_FILE}" 2>/dev/null || echo "")
  if [ "${CURRENT_HASH}" = "${STORED_HASH}" ]; then
    echo "[rasa-train] 학습 데이터 변경 없음 — 기존 모델 사용."
    ls -lh "${MODEL_DIR}"/*.tar.gz
    exit 0
  fi
  echo "[rasa-train] 학습 데이터 변경 감지 — 재학습을 시작합니다..."
else
  echo "[rasa-train] 학습된 모델이 없습니다. 학습을 시작합니다..."
fi

python3 -m rasa train \
  --domain /app/domain.yml \
  --data    /app/data \
  --config  /app/config.yml \
  --out     "${MODEL_DIR}"

echo "${CURRENT_HASH}" > "${HASH_FILE}"
echo "[rasa-train] 학습 완료."
