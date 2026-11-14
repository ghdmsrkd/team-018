# BUILD_REPORT · HARU

팀 Kiro비컴휴먼 (team-018) · 키로톤 · 2026-11-14

Kiro를 어느 단계에서 어떻게 썼는지 기록한다. 시간은 한국 시간(KST)이다. 근거는 이 저장소의 커밋 기록, `.kiro/` 파일, 팀원 로컬의 Kiro 세션 기록이다.

> ⚠ 표시는 저장소만으로는 확인할 수 없어 해당 담당자가 채워야 하는 칸이다.

## 단계별 Kiro 사용

| 단계 | 시간 | 담당 | Kiro를 쓴 방식 | 산출물 | 근거 |
|---|---|---|---|---|---|
| 0. 아이디어 프로토타입 | 08:11–14:10 | DDooTTaa | Kiro 에이전트 세션(KiroCrew, Auto 모델)에서 대화로 앱 아이디어를 HTML 프로토타입으로 만들며 다듬음 | `haru-demo.html` (초기 프로토타입, 저장소 미포함) | 로컬 Kiro 세션 기록 · 파일 스냅샷 18개 |
| 1. 프로젝트 컨텍스트 고정 | 13:31–13:37 | victor | **Steering** `.kiro/steering/memory.md`(`inclusion: always`)를 만들어 해커톤 배경, 팀 규모, AWS 개인 프로필, Git 규칙(에이전트가 커밋·푸시 전담), "시크릿 커밋 금지"를 모든 에이전트 작업에 자동 적용 | `.kiro/steering/memory.md` | `d0b3435`, `fed3bb7` |
| 2. 서비스 기획서 | 14:11–15:28 | DDooTTaa | Kiro 에이전트 세션에서 기획서를 대화로 작성하고 여러 번 고쳐 씀 (스냅샷 4회). 서비스 개요, 핵심 기능, 화면 구성, 기술 스택, 데이터 모델, MVP 범위 | `하루_기획서.md` → [`docs/하루_기획서_v0.1.md`](docs/하루_기획서_v0.1.md) (`feat/haru-planning`) | `e0eef3d` · 로컬 Kiro 세션 기록 |
| 3. 기능 기획 · 유저 스토리 | 14:39–15:28 | victor | Steering이 적용된 에이전트로 기능 기획 v0.1, 유저 스토리 맵, 더미 데이터 설계, 장소 태그 규칙을 작성. 아이폰 실제 방문 데이터 형식을 분석한 결과를 **steering에 다시 기록**해 이후 설계·구현의 기준으로 씀 | [`docs/PLAN.md`](docs/PLAN.md), [`docs/user-stories.html`](docs/user-stories.html), [`docs/data/ios-visit-sample.json`](docs/data/ios-visit-sample.json) | `3265161` `71b5630` `68b81ee` `ec4fbc1` `3ff9493` |
| 4. 앱 디자인 v0.1 | 15:34 | victor | ⚠ 팀 확인 | [`design/haru-app-design.html`](design/haru-app-design.html), `design/source/*.dc.html` | `ba46e8f` |
| 5. 시스템 설계 | 15:44–15:49 | victor | ⚠ 팀 확인 (Cognito 직접 호출안 → Lambda 중계안으로 변경) | [`docs/system-design.html`](docs/system-design.html) | `d568eb1` `9765895` |
| 6. 백엔드 · 스키마 | 16:00–16:39 | victor | Steering의 인프라 규칙(AWS CLI 스크립트만, CDK·Terraform 없음, Cognito 없음, 키·URL·`.env` 커밋 금지)에 맞춰 구현. 구조가 정해지자 **steering을 갱신**해 이후 작업에도 같은 규칙이 적용되게 함 | `backend/`, `packages/schema/`, [`docs/app-handoff.md`](docs/app-handoff.md) | `18cd45f` `2e179e6` `2ef1e13` `a7241ed` |
| 7. iOS 앱 구현 | 15:47–17:02 | DoubleJONY | ⚠ 팀 확인 | `app/mobile/` | `fa8fc79` `dab5ab8` `577f35b` `087b332` `d166969` |

## `.kiro/` 구성

| 경로 | 상태 |
|---|---|
| `.kiro/steering/memory.md` | 커밋됨. 해커톤 배경, AWS 프로필, 인프라 원칙, Git 규칙, 아이폰 방문 데이터 형식 |
| `.kiro/specs/` | ⚠ 저장소에 없음. 팀원 로컬에 있으면 그대로 커밋 |
| `.kiro/hooks/` | ⚠ 저장소에 없음. 팀원 로컬에 있으면 그대로 커밋 |

## Kiro를 쓰며 효과를 본 점

- **Steering을 팀 공용 기억으로 썼다.** AWS 프로필, 리전, "키를 커밋하지 않는다" 같은 규칙을 한 번 적어 두자, 이후 세션마다 다시 설명하지 않아도 됐다. 공개 저장소지만 키·Lambda URL·`.env`는 한 번도 커밋되지 않았다.
- **발견한 사실을 steering에 되돌려 적었다.** 아이폰 방문 데이터가 좌표가 아니라 방문(Visit) 단위이고 정확도가 35–80m라는 분석을 steering에 넣어, 데이터 모델·태그·장소 매칭 반경 설계가 모두 같은 전제에서 출발했다.
- **설계가 바뀌면 steering도 같이 바꿨다.** Cognito 안에서 Lambda 중계 안으로 바뀌었을 때 steering의 인프라 항목을 갱신해, 이후 백엔드·앱 작업이 새 구조를 따랐다.
- **기획을 대화로 반복했다.** 서비스 기획서를 Kiro 에이전트와 여러 번 고쳐 쓰며 MVP 범위와 데이터 모델을 좁혔다.
