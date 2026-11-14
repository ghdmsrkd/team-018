#!/usr/bin/env bash
# 배포된 Lambda 확인: /health 와 도구 호출(/chat) 한 번
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="${API_URL:-$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' "$DIR/.deploy-state.json")}"

echo "--- /health"
curl -s -m 20 "$URL/health"; echo

echo "--- /chat (tool use)"
curl -s -m 60 -X POST "$URL/chat" -H 'content-type: application/json' -d '{
  "system":[{"text":"You answer by calling tools. Never guess."}],
  "messages":[{"role":"user","content":[{"text":"강원도 여행 언제 갔어? v_trips 뷰(id,name,start_date,end_date,regions)를 조회해."}]}],
  "toolConfig":{"tools":[{"toolSpec":{"name":"query_sql","description":"Run a read-only SELECT on the memory views.",
    "inputSchema":{"json":{"type":"object","properties":{"sql":{"type":"string"}},"required":["sql"]}}}}]}
}'
echo
