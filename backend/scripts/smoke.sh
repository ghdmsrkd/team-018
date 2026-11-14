#!/usr/bin/env bash
# 배포된 HARU API를 공개 랜드마크 좌표와 테스트 질문으로 확인한다.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="${API_URL:-$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["url"])' "$DIR/.deploy-state.json")}"
URL="${URL%/}"

python3 - "$URL" <<'PY'
import json
import sys
import urllib.error
import urllib.request

url = sys.argv[1]


def request(path, payload=None, timeout=20):
    headers = {"content-type": "application/json"} if payload is not None else {}
    data = json.dumps(payload).encode() if payload is not None else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url + path, data, headers), timeout=timeout) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        sys.exit(f"{path} HTTP {error.code}")
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        sys.exit(f"{path} 요청 실패 ({type(error).__name__})")
    return result


def check(condition, message):
    if not condition:
        sys.exit(message)


health = request("/health")
provider = health.get("placesProvider")
check(health.get("ok") is True and bool(health.get("model")) and "placesProvider" in health,
      "/health 응답 계약 오류")
print(f"/health OK (model={health['model']}, placesProvider={provider})", flush=True)

# 경복궁
coordinates = {"lat": 37.5796, "lng": 126.977}
geocode = request("/geocode", coordinates)
check(bool(geocode.get("documents")), "/geocode 행정구역 결과 없음")
print("/geocode OK", flush=True)

nearby = request("/places/nearby", {**coordinates, "horizontalAccuracy": 100})
sources = {"google": "google_places", "kakao": "kakao_local"}
places = nearby.get("places")
check(provider in sources and nearby.get("provider") == provider
      and nearby.get("source") == sources[provider] and nearby.get("radiusMeters") == 100
      and isinstance(places, list) and len(places) <= 10, "/places/nearby 응답 계약 오류")
print(f"/places/nearby OK (provider={provider}, candidates={len(places)}, "
      f"incomplete={bool(nearby.get('incomplete'))})", flush=True)
check(not nearby.get("incomplete"), "/places/nearby 일부 카테고리 조회 실패")

chat = request("/chat", {
    "system": [{"text": "답변하기 전에 반드시 query_sql을 호출하세요."}],
    "messages": [{"role": "user", "content": [
        {"text": "가상 데모의 여행 목록을 확인해 줘. v_trips 뷰에서 id와 name을 조회해."},
    ]}],
    "toolConfig": {"tools": [{"toolSpec": {
        "name": "query_sql",
        "description": "Run a read-only SELECT on the memory views.",
        "inputSchema": {"json": {
            "type": "object",
            "properties": {"sql": {"type": "string"}},
            "required": ["sql"],
        }},
    }}]},
}, timeout=65)
content = chat.get("output", {}).get("message", {}).get("content", [])
check(chat.get("stopReason") == "tool_use"
      and any(block.get("toolUse", {}).get("name") == "query_sql"
              and isinstance(block["toolUse"].get("input", {}).get("sql"), str) for block in content),
      "/chat query_sql 도구 요청 없음")
print("/chat OK (query_sql tool_use)", flush=True)
PY
