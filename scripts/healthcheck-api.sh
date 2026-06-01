#!/bin/bash
# localhost:8087（SSH port forward 経由の andersan-api）の死活監視。
# 成功時のみ Healthchecks.io に ping する。
set -euo pipefail

API_URL="${ANDERSAN_API_URL:-http://localhost:8087/openapi.json}"
HC_PING_URL="${ANDERSAN_HC_PING_URL:-https://hc-ping.com/1f98b6a5-8b94-4de9-816a-085d734ee098}"

curl -fsS --connect-timeout 5 --max-time 15 "$API_URL" > /dev/null
curl -fsS --connect-timeout 10 --max-time 15 "$HC_PING_URL"
