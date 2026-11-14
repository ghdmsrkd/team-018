# 앱 개발자 인수 안내 (백엔드 1차 진행 중)

> 2026-11-14 기준. 아래 "지금 쓸 수 있는 것"만 사용하고, "아직 없는 것"은 목업으로 대체한다.

## 구조 한 줄 요약
앱(SQLite 2개) → Lambda Function URL(`haru-api`) → Bedrock. 서버 DB도 Cognito도 없다. 앱 코드에 API 키를 넣지 않는다.

## 지금 쓸 수 있는 것
| 항목 | 위치 | 쓰는 법 |
|---|---|---|
| **SQLite DDL** | `packages/schema/src/ddl.ts` | `RAW_DDL` → `raw.db`, `MEMORY_DDL` + `AGENT_VIEWS_DDL` → `memory.db`에 `execAsync`로 실행 |
| **타입** | `packages/schema/src/types.ts`, `api.ts` | `Place`, `Stay`, `Trip`, `Day`, `ChatRequest`, `AgentAnswer` 등 |
| **태그 목록** | `TAGS` (`types.ts`) | `집 회사 밥집 커피 운동 쇼핑 관광`. 이 7개 외에는 쓰지 않는다 |
| **Lambda API** | `backend/lambda/index.mjs`, 계약은 `api.ts` | `GET /health`, `POST /chat`, `POST /geocode`, `POST /places/nearby` |
| **데모 SQLite** | `artifacts/memory.db` | 생성 데이터로 만든 스키마 v1의 화면 및 로컬 도구 검증용 DB |

### 시작하기
1. 저장소 루트에서 `pnpm install`.
2. 앱에서 `@haru/schema`를 workspace 의존성으로 추가한다. 패키지는 TS 소스를 그대로 내보낸다(빌드 없음).
3. `.env.example`을 `.env`로 복사하고 `EXPO_PUBLIC_API_URL`에 Lambda URL을 넣는다. **URL은 저장소에 올리지 않고 팀 채팅으로 받는다.**
4. 시간은 모두 unix 초(UTC)로 저장한다. `day` 컬럼과 뷰의 시각 문자열은 한국 시간(KST) 기준이다.

### 규칙
- 에이전트(LLM)가 보는 것은 `v_*` 뷰뿐이다. `raw.db`와 좌표는 절대 LLM에 보내지 않는다.
- 태그는 `places`에 붙는다. `tag_source = 'human'`인 행은 AI가 덮어쓰지 않는다.
- 근거 카드는 모델이 준 `{type, id}`로 앱이 DB에서 다시 조회해 만든다. 모델이 준 텍스트로 카드를 만들지 않는다.

## 아직 없는 것 (백엔드 담당이 만드는 중)
| 항목 | 상태 | 그동안 앱에서 할 일 |
|---|---|---|
| **에이전트의 iOS 연동** | 공용 도구 루프·카드 검증 구현 | 읽기 전용 SQLite 조회와 카드 존재 확인을 iOS 어댑터에 연결한다 |

### `/chat` 모델
개발 중에는 **Claude Haiku 4.5**(`global.anthropic.claude-haiku-4-5-20251001-v1:0`)로 배포되어 있고, 도구 호출까지 동작한다. 데모용 `gpt-6-luna`는 계약은 맺었지만 아직 호출이 거부되어 보류 중이다. 모델은 Lambda 환경변수 `MODEL_ID` 하나로 바뀌므로 앱 코드는 바꿀 필요가 없다.

연결 확인:
```bash
curl -s $EXPO_PUBLIC_API_URL/health
# {"ok":true,"model":"global.anthropic.claude-haiku-4-5-20251001-v1:0","placesProvider":"kakao"}
```
`/chat` 요청은 `packages/schema/src/api.ts`의 `ChatRequest`, 응답은 `ChatResponse`다. 응답의 `stopReason`이 `tool_use`면 `toolUse` 블록을 실행하고 `toolResult`를 붙여 다시 보내는 것을 반복한다 (최대 6회).
오류 응답: 400 잘못된 요청, 413 본문이 200KB 초과, 429 호출 과다, 502 Bedrock 오류.

## 데모 DB와 실기기 연동

- `artifacts/memory.db`는 2025-11-15~2026-11-14의 365일, 장소 48개, 체류 1,982건, 여행 10건, 이동 1,617건을 담는다. `PRAGMA quick_check`와 `PRAGMA foreign_key_check`를 통과했다. `artifacts/memory.groundtruth.db`는 생성기의 정답 데이터이며 앱 검증용 산출물은 `memory.db`다.
- 데모를 연결할 때는 별도 번들 DB로 열 수 있다. 실사용 시에는 기존 `visits.sqlite`의 CLVisit에서 방문→장소→체류를 변환해 기기의 별도 `memory.db`를 채워야 한다. 출발 시각이 아직 없는 방문과 늦게 도착하는 방문을 변환 과정에서 처리한다. 지도 재생의 `moves.path`는 JSON이고 CLVisit 사이 실제 경로는 별도 데이터가 필요하다.
- `@haru/agent`의 `askMemory(question, adapters)`는 최대 6회 도구 결과를 `toolUseId`에 맞춰 `/chat`에 돌려주고, 최종 답변의 카드 중 로컬 DB에 존재하는 참조를 남긴다. Bedrock `toolResult.content[].json`에는 배열을 직접 넣으면 HTTP 400이므로 `{ rows: [...] }` 객체로 감싼다.
- iOS는 로컬 `querySql`과 `cardExists`를 어댑터로 제공할 수 있다. SQL 실행기에서 `v_days`, `v_places`, `v_stays`, `v_stay_places`, `v_trips`만 허용하고 행 수와 출력 크기를 제한한다. `/chat`은 Bedrock 중계이고 SQL은 앱 내부에서 실행하므로 별도 HTTP `/sql` 경로는 필요 없다.
- 현재 Node용 SQLite 구현은 `node:sqlite`를 사용한다. bare React Native iOS에서는 Swift 쪽 SQLite 실행기나 RN 호환 어댑터를 연결한다. 시간대와 태그 매핑 차이는 아래 실기기 연동 항목을 따른다.

## 변경이 생기면
스키마나 API를 바꾸면 `packages/schema`의 타입과 이 문서를 같이 고치고 팀 채팅에 알린다. 백엔드는 `backend/*`, `packages/*`만 수정한다.

## 앱 담당 검토 코멘트 (2026-11-14, `app/mobile` bare RN iOS)

**현재 호환 범위**
- 앱은 Expo가 아니라 bare React Native + Swift다. 위치는 Swift `CLLocationManager.startMonitoringVisits`(CLVisit)로 받아 앱 자체 SQLite(`Application Support/VisitStore/visits.sqlite`)에 저장한다. 기존 기록과 태그를 지키려고 Expo 전환과 `expo-sqlite`는 하지 않았다.
- 공유 계약 타입은 `@haru/schema`를 tsconfig `paths`로 직접 `import type` 한다(`app/mobile/src/api/chatClient.ts`, `demoAnswer.ts`). 앱은 pnpm workspace 밖이라 런타임 값(`TAGS`, DDL 문자열)은 import하지 않는다. 런타임 import가 필요해지면 Metro `watchFolders` 설정이 먼저 필요하다.
- Lambda URL은 `EXPO_PUBLIC_API_URL`(루트 `.env`) 또는 `HARU_API_URL`(`app/mobile/.env`)에서 iOS 빌드 단계 `ios/scripts/inject-api-url.sh`가 빌드 산출물 Info.plist(`HaruApiUrl`)에 넣는다. 코드와 저장소에는 URL이 없다. https만 받는다.
- `/health`는 물어보기 탭에서 호출해 연결 상태와 모델 이름을 보여 준다. `/chat` 전송 함수는 계약대로 있다. 중계는 Haiku 4.5로 `tool_use`까지 동작하지만(위 "`/chat` 모델"), 앱 쪽 준비가 안 돼서 라이브 질문 전송은 꺼져 있다(`CHAT_SEND_ENABLED = false`, 아래 남은 의존성). `/geocode`는 호출하지 않는다.
- 샘플 모드의 물어보기는 고정 `AgentAnswer`를 쓰고, 카드 `{type, id}`는 앱의 샘플 방문에서 다시 조회한다(`day`, `stay`만). 모델 호출은 없다.
- `RAW_DDL`/`MEMORY_DDL`은 아직 적용하지 않았다. 지금 앱 화면은 CLVisit 저장소를 직접 읽고, `memory.db`를 채우는 엔진(방문→장소→stay)이 앱에 없어서 빈 DB를 만들어도 소비하는 경로가 없다. 기존 `visits.sqlite`는 그대로 둔다.

**시각 경계**
- 앱 저장소는 epoch **초**(SQLite) → JS **ms**로 바꿔 쓴다. 공유 스키마도 unix 초(UTC)라 변환은 `/1000`만 하면 된다.
- 앱 화면의 날짜/기간 경계는 **기기 현지 시간**(DST 반영)이다. 공유 스키마의 `day`와 뷰 문자열은 **KST 고정**이다. 기기 시간대가 KST가 아니면 같은 방문이 다른 날로 묶일 수 있다. 근거 카드 `day` id 매칭은 KST로 한다(`kstDay`).

**태그 정책 차이**
- 공유 `TAGS`는 닫힌 7개(`집 회사 밥집 커피 운동 쇼핑 관광`), 태그는 `places`에 붙는다.
- 앱은 프리셋 25개 + 사용자 태그를 쓰고, 태그는 **방문**에 붙는다. 수동 태그 위치에서 50m 안의 새 방문에 자동 지정하고 `source`는 `manual`/`auto`다(공유 스키마의 `human`/`ai`와 다름).
- 연결 시 매핑 규칙(예: 카페→커피, 식당→밥집, 7개 밖 태그는 null 또는 별도 처리)과 `manual`→`human` 대응을 정해야 한다. 제품 결정 전이라 앱 태그 목록은 바꾸지 않았다.

**남은 의존성 (앱이 기다리는 것)**
- (해결됨) `/chat` 중계는 Haiku 4.5 배포로 `tool_use`까지 확인됐다. `AccessDeniedException`은 `gpt-6-luna` 모델에만 남아 있는 권한 이슈이고, 모델은 Lambda `MODEL_ID`로만 바뀌므로 앱에는 영향이 없다.
- 기기의 `memory.db`(`v_*` 뷰 포함)와, 그 위에서 도는 에이전트 패키지(SQL 가드, 도구 루프, 카드 조립) + 로컬 읽기 전용 `query_sql` 도구. 앱의 라이브 질문 전송을 막는 실제 이유는 이것이다.
- 실제 배포 URL이 앱 담당 로컬에 아직 없다. 받으면 `app/mobile/.env`(gitignore)에 넣고 빌드해 `/health`를 실기기에서 확인한다.
- 위가 갖춰지면 `CHAT_SEND_ENABLED`를 켜고 `/chat`을 실기기에서 검증한다.

### 앱 담당 코멘트: 주변 장소 후보 (`POST /places/nearby`, 2026-11-14)
- 백엔드: Lambda `/places/nearby`가 Google Places API (New) Nearby Search 또는 Kakao Local 카테고리 검색 중 **설정된 한 공급자**만 호출한다(Google 키 우선, 없으면 `KAKAO_REST_KEY`). 둘 다 없으면 501이고 외부 호출이 없다. `/health`가 `placesProvider`를 알려 준다. 세부는 `backend/README.md`, 타입은 `api.ts`(`PlacesProvider`, `PlaceCandidate`, `PlacesNearbyResponse`, `HealthResponse`). **팀 서울 리전에서 배포 및 확인했다.** `/health`는 `kakao`를 반환했고 경복궁 좌표로 `/geocode`와 `/places/nearby`가 성공했다. `deploy.sh`는 넘기지 않은 키를 기존 함수 설정에서 보존한다.
- 앱: 태그 시트(미분류 방문의 "태그 달기", 기존 방문의 "변경" 둘 다)에 "주변 장소 찾기"가 있다. 버튼을 누를 때만 해당 방문의 `lat/lng/horizontalAccuracy` 세 값을 보낸다. 검색 전에 "AWS Lambda를 거쳐 {Google|카카오} 한 곳으로 전달"을 안내하고(시트를 열 때 위치 없이 `/health`만 확인), 결과 아래에 공급자 표기("Google Maps" / "© Kakao")와 후보별 제3자 출처를 보여 준다. 자동·백그라운드 전송은 없다.
- 저장: 후보를 고르면 앱 SQLite에 **장소 ID만** 저장한다(스키마 v2, 별도 테이블 `visit_places(visit_id, google_place_id, chosen_at)`, 기존 행 변경 없음). 컬럼 이름은 처음 구현 그대로 두었고, 값은 Google ID 그대로(이전 저장분과 호환) 또는 `kakao:<id>`다. 이름·주소·좌표는 화면 상태에만 있고 시트를 닫으면 사라진다. 이름을 다시 보여 주려면 저장된 ID로 공급자별 상세 조회가 추후 필요하다. 방문 태그(25+ 사용자 태그)와 50m 자동 매칭은 이것과 독립이다.
- 미구현: 선행 "장소 제안" 계약(자동 추정 결과 unknown/failed)은 없다. 앱의 검색 UI(`app/mobile/src/NearbyPlaceSearch.tsx`)는 `reason='unknown'|'failed'`를 받아 같은 화면으로 재사용할 수 있게 해 두었다.
- 실기기 확인은 팀 Function URL을 로컬 빌드 설정에 넣은 뒤 진행한다.
