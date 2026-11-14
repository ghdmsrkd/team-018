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
