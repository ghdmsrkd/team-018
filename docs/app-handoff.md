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
| **Lambda API** | `backend/lambda/index.mjs`, 계약은 `api.ts` | `POST {API_URL}/chat`, `GET {API_URL}/health` |

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
| **더미 `memory.db` (12개월 치)** | 미완 | 화면은 `MEMORY_DDL`로 빈 DB를 만들고 직접 몇 행을 넣어 개발한다 |
| **에이전트 패키지** (SQL 가드, 도구 루프, 카드 조립) | 미완 | 챗 화면은 `AgentAnswer` 타입의 고정 응답으로 목업한다 |
| `/geocode` | 키 미설정 (501) | 데모는 호출하지 않는다 |

### `/chat` 모델
개발 중에는 **Claude Haiku 4.5**(`global.anthropic.claude-haiku-4-5-20251001-v1:0`)로 배포되어 있고, 도구 호출까지 동작한다. 데모용 `gpt-6-luna`는 계약은 맺었지만 아직 호출이 거부되어 보류 중이다. 모델은 Lambda 환경변수 `MODEL_ID` 하나로 바뀌므로 앱 코드는 바꿀 필요가 없다.

연결 확인:
```bash
curl -s $EXPO_PUBLIC_API_URL/health
# {"ok":true,"model":"global.anthropic.claude-haiku-4-5-20251001-v1:0"}
```
`/chat` 요청은 `packages/schema/src/api.ts`의 `ChatRequest`, 응답은 `ChatResponse`다. 응답의 `stopReason`이 `tool_use`면 `toolUse` 블록을 실행하고 `toolResult`를 붙여 다시 보내는 것을 반복한다 (최대 6회).
오류 응답: 400 잘못된 요청, 413 본문이 200KB 초과, 429 호출 과다, 502 Bedrock 오류.

## 이어서 진행하는 순서 (앱)
1. 앱 골격(Expo) + `expo-sqlite`로 `raw.db`, `memory.db` 열기, DDL 실행
2. 더미 `memory.db`가 나오기 전까지 샘플 행으로 **오늘 타임라인**(US-09) 화면
3. 태그 달기/정리 화면(US-11, 29): `places.tag`, `tag_source='human'`으로 UPDATE
4. 더미 `memory.db`가 오면 앱 번들에 넣고 교체. 지도 재생(US-12, 13)은 `moves.path`(JSON)를 쓴다
5. 에이전트 패키지가 오면 챗 화면 연결

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
