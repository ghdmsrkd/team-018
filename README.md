# HARU

> **기록하지 않아도 기억되는 하루.**
> 폰이 위치·사진·시간으로 하루를 자동으로 기록하고, 머문 곳을 "무엇을 했나"로 분류해 두었다가, 물어보면 근거와 함께 찾아 주는 개인 라이프로그 앱

**Demo**: https://haru-demo-tawny.vercel.app (발표 사이트 + 눌러 볼 수 있는 앱 시현. `←` `→`로 넘기고 `N`으로 대본)

키로톤 · 팀 **Kiro비컴휴먼** (team-018) · 발표자료 [PRESENTATION.pdf](PRESENTATION.pdf) · Kiro 사용 기록 [BUILD_REPORT.md](BUILD_REPORT.md)

| 오늘 · 24시간 도넛 | 타임라인 · 사진/영상 | 오늘 · 1년 | 물어보기 · 근거 카드 |
|---|---|---|---|
| ![오늘](design/mockup/day.png) | ![타임라인](design/mockup/timeline.png) | ![1년](design/mockup/year.png) | ![물어보기](design/mockup/ask.png) |

---

## 문제 정의

**"그때 나는 어디서 뭘 했지?"** 에 답할 방법이 없다.

- 답은 이미 폰 안에 있다. 폰은 내가 어디에 머물렀는지 알고, 그날 찍은 사진도 있다. 하지만 **흩어져 있어서 꺼낼 수 없다.**
- "작년 크리스마스에 뭐 했지?"를 찾으려면 사진첩을 몇 달 치 스크롤하고, 지도 앱과 카드 내역을 뒤져야 한다. 사진이 없는 시간은 아예 비어 있다.
- 일기를 쓰면 되지만 대부분 며칠 만에 멈춘다. **기록에 노력이 드는 순간 기록은 끊긴다.**
- 숫자 27개가 흩어져 있으면 1부터 찾기 어렵지만, 칸만 그으면 바로 찾는다. 삶도 같다. 정보가 같아도 **나뉘어 있어야** 보인다.

## 핵심 기능

| 기능 | 설명 |
|---|---|
| **자동 기록** | 백그라운드 위치를 iOS 방문(Visit) 단위로 모은다. 사용자는 아무것도 입력하지 않는다 |
| **24시간 도넛 (오늘)** | 0시가 맨 위인 시계 모양 도넛에 머문 곳이 실제 시간 위치에 태그 색으로 칠해진다. 하루 / 한 주 / 한 달 / 1년 탭으로 태그별 비중과 증감을 본다 |
| **장소 태그** | 닫힌 태그 7개(`집` `회사` `밥집` `커피` `운동` `쇼핑` `관광`). AI가 하나를 고르거나 확신이 없으면 비워 둔다. 사람이 단 태그는 AI가 덮어쓰지 않고, 한 번 달면 그 장소의 모든 방문에 적용된다 |
| **타임라인 + 사진·영상** | 날짜별로 머문 곳이 시간순으로 쌓이고, 촬영 시각·위치로 그 장소에서 찍은 사진과 영상이 자동으로 붙는다. 여행은 묶음 카드로 나온다 |
| **지도 재생** | 날짜·여행을 고르면 지도 위에서 이동이 시간순으로 다시 흐른다 |
| **물어보기 (기억 챗)** | "올해 강원도 몇 번 갔지?" → LLM이 폰의 읽기 전용 DB 뷰를 조회(`query_sql`)해 답하고, 앱이 실제 기록으로 **근거 카드**를 만든다 |

### 현재 구현 상태 (2026-11-14)

| 영역 | 상태 |
|---|---|
| iOS 방문 수집 (`VisitMonitorModule`) · 오늘 도넛 · 타임라인 · 사진/영상 연결 · 지도 재생 · 태그 달기 · 주변 장소 검색 | 구현됨. 샘플 방문 데이터와 실제 수집 데이터 모두로 동작 |
| 백엔드 Lambda (`/chat` Bedrock 중계, `/geocode`, `/places/nearby`, `/health`) | 구현 · 배포됨 |
| 물어보기 | **데모 답변**으로 동작. 기기 내 `memory.db`와 `query_sql` 도구 루프가 아직 없어 실제 LLM 전송은 꺼 둠 (`CHAT_SEND_ENABLED = false`) |
| 12개월 더미 데이터 생성기 · 여행(Trip) 자동 감지 | 설계 완료, 구현 전 |

## 사용 시나리오

1. **설치 직후** 위치 권한을 허용하고 그냥 평소처럼 지낸다.
2. **저녁**에 앱을 열면 오늘 하루가 도넛으로 정리되어 있다. 집 9시간 50분, 카페 45분, 지하철, 그리고 처음 간 행사장(태그 없음). 행사장에 태그를 한 번 달아 둔다.
3. **주말**에 타임라인을 넘겨 보면 지난주 성수 파스타집에서 찍은 사진이 그 방문에 붙어 있다.
4. **몇 달 뒤** "저번에 강원도 갔던 게 며칠이었지?"라고 묻는다. → "10월 3일–5일, 2박 3일. 강릉 → 속초"와 근거 카드. 카드의 [재생]을 누르면 그 여행이 지도 위에서 다시 흐른다.
5. **연말**에 1년 탭을 열면 올해 어디에 시간을 썼는지, 여행을 몇 번 다녀왔는지 한눈에 보인다.

## 기대 효과

- **입력 0으로 쌓이는 기록**: 일기처럼 끊기지 않는다. 켜 두기만 하면 하루 단위로 남는다.
- **찾는 시간 단축**: 사진첩·지도·카드 내역을 뒤지던 일이 질문 한 줄로 끝난다.
- **삶의 패턴이 보인다**: 태그별 시간 비중과 증감으로 "요즘 운동을 얼마나 했는지", "회사에 얼마나 있었는지"를 숫자로 본다. 분류된 삶은 더 명확하게 살 수 있다.
- **믿을 수 있는 회상**: 답에는 항상 실제 기록 카드가 붙어 AI가 날짜를 지어낼 수 없다.
- **안심하고 쓰는 위치 앱**: 데이터는 폰에만 있고, AI에는 질문에 필요한 조회 결과만 간다.

## 차별점

| 서비스 유형 | 자동 기록 | "무엇을 했나" | 사진·영상 연결 | 물어보면 답 | 한계 |
|---|:-:|:-:|:-:|:-:|---|
| 위치 기록 (지도 앱 타임라인) | ● | ✕ | △ | ✕ | 간 곳은 남지만 의미가 없다 |
| 사진 앱 | △ | ✕ | ● | △ | 사진 찍은 순간만 기억한다 |
| 일기 · 라이프로그 앱 | ✕ | ● | △ | ✕ | 직접 써야 한다 |
| 시간 기록 앱 | ● | △ | ✕ | ✕ | 비중은 보여도 기억을 꺼낼 수 없다 |
| **HARU** | ● | ● | ● | ● | 입력 0 · 장소에 의미 · 사진 자동 연결 · 근거 있는 답 |

- **LLM은 데이터를 읽지 않고 조회한다.** 모델은 읽기 전용 뷰에 SQL만 실행할 수 있고, 근거 카드는 모델이 준 ID로 앱이 DB에서 다시 만든다.
- **AI는 모르면 비워 둔다.** 태그 출력은 enum + null로 강제한다. `기타` 같은 버림 태그가 없다.
- **서버 DB가 없다.** 원시 좌표(`raw.db`)는 에이전트가 열 수 없고, 에이전트용 뷰에는 좌표 컬럼이 없다. 집·회사는 이름으로만 보인다.

## 설치와 실행

### 1. 발표 사이트 · 앱 시현 (가장 빠름)

배포본: https://haru-demo-tawny.vercel.app

로컬에서 열기 (빌드 없음):

```bash
mkdir -p site/app && cp design/haru-mockup.html site/app/ && python3 -m http.server 8765
```

→ `http://localhost:8765/site/` · 목업만 보려면 `http://localhost:8765/design/haru-mockup.html`

### 2. iOS 앱 (`app/mobile`, React Native)

필요: macOS, Xcode, Node 22.11 이상, Ruby(CocoaPods), pnpm

```bash
pnpm install
```

```bash
cd app/mobile && npm install && bundle install && (cd ios && bundle exec pod install)
```

```bash
cd app/mobile && npm run ios
```

- 백엔드 없이도 샘플 방문·사진·영상 데이터로 화면이 동작한다 (데모 데이터 소스).
- 백엔드 연결(상태 확인, 주변 장소 검색): 루트 `.env.example`을 `.env`로 복사하고 `EXPO_PUBLIC_API_URL`에 Lambda Function URL을 넣는다. 빌드 때 `ios/scripts/inject-api-url.sh`가 앱에 주입한다. URL은 저장소에 올리지 않는다.
- 테스트: `cd app/mobile && npm test`

### 3. 백엔드 (`backend`, AWS Lambda 1개)

필요: AWS CLI와 Bedrock 접근이 켜진 계정 (리전 `ap-northeast-2`)

```bash
cp backend/secrets.env.example backend/.secrets.env
```

```bash
./backend/scripts/deploy.sh
```

```bash
./backend/scripts/smoke.sh
```

- `/chat` → Amazon Bedrock Converse 중계 (기본 모델 Claude Haiku 4.5), `/geocode` → Kakao 행정구역, `/places/nearby` → Google Places 또는 Kakao Local, `/health`
- 모델 ID와 `maxTokens`는 서버에서 고정, 예약 동시성 상한, 요청 본문은 로그에 남기지 않는다
- 정리: `./backend/scripts/teardown.sh`
- 자세한 내용: [backend/README.md](backend/README.md), API 계약 [packages/schema/src/api.ts](packages/schema/src/api.ts)

---

## 구조 (시스템 설계 기준)

```
앱 (React Native · iOS)
 ├─ raw.db     원시 위치 (에이전트 접근 불가)
 ├─ memory.db  장소 · 방문 · 여행 · 하루 + 에이전트용 읽기 전용 뷰 (좌표 없음)
 └─ HTTPS ──▶ Lambda (Function URL) ──▶ Amazon Bedrock (Converse, tool use)
                                    └─▶ Kakao Local / Google Places
```

| 경로 | 내용 |
|---|---|
| `app/mobile/` | iOS 앱 (오늘 도넛, 타임라인, 물어보기, 재생, 태그, 주변 장소 검색) |
| `backend/` | Lambda 중계와 AWS CLI 배포 스크립트 |
| `packages/schema/` | SQLite DDL, 공용 타입, API 계약 |
| `site/` | 발표 사이트 (Vercel 배포본의 원본) |
| `design/` | 앱 디자인 v0.1, 메인 화면 목업 v0.4 |
| `docs/` | [기획서 v0.2](docs/기획서_v0.2.md), [기능 기획](docs/PLAN.md), [시스템 설계](docs/system-design.html), [유저 스토리](docs/user-stories.html), [앱 인수 안내](docs/app-handoff.md) |
| `.kiro/` | Kiro steering |

## 팀 Kiro비컴휴먼

| GitHub | 담당 |
|---|---|
| ghdmsrkd (victor) | 기능 기획, 유저 스토리, 앱 디자인 v0.1, 시스템 설계, 백엔드 · 스키마 |
| DoubleJONY | iOS 앱 구현 (방문 수집, 도넛, 타임라인, 사진·영상, 물어보기, 재생) |
| DDooTTaa | 서비스 기획서, 메인 화면 목업, 발표 사이트 · 발표 |
