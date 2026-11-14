---
inclusion: always
---

# Agent memory

## 프로젝트 배경
- 지금 "키로톤"(Kiro 해커톤)에 참가 중이다. 팀원은 3명이다.
- 주제: 일상 속에서 바로 적용할 수 있는 서비스

## AWS
- 이 프로젝트에서 AWS CLI는 개인 프로필 `me-private-m1-mac-pro`를 사용한다.
  - 예: `aws <command> --profile me-private-m1-mac-pro` 또는 `AWS_PROFILE=me-private-m1-mac-pro`
- 회사 프로필(`default`, `default-stayge`, `derma-clinic`)은 사용하지 않는다.
- 이 프로필은 `~/.aws/config`에 리전 설정이 없으므로 필요하면 `--region ap-northeast-2`를 명시한다.

## 인프라
- 인프라는 AWS CLI 스크립트로만 만든다 (`backend/scripts/`). CDK, Terraform은 쓰지 않는다.
- 구조: 앱(SQLite) → Lambda Function URL(`haru-api`) → Bedrock. Cognito는 쓰지 않는다.
- 저장소가 공개라서 키, Lambda URL, `.env`는 커밋하지 않는다.
- `global.openai.gpt-6-luna`는 이 계정에서 사용 계약(agreement)이 필요하다. 사용자 승인 없이 계약하지 않는다.

## Git
- Git 작업은 에이전트가 전부 처리한다.
- 의미 있는 작업 단위마다 중간중간 커밋한다.
- 커밋 후 GitHub(`origin`, `https://github.com/ghdmsrkd/team-018.git`)에 푸시한다.
- 시크릿(액세스 키, 토큰 등)은 절대 커밋하지 않는다.

## 데이터: 아이폰 위치 원본 포맷
- 아이폰에서 받은 실제 GPS 데이터 샘플: `docs/data/ios-visit-sample.json` (데이터 설계 시 기준으로 삼는다)
- 필드: `id`, `latitude`, `longitude`, `horizontalAccuracy`(m), `arrivalAt`, `departureAt`, `receivedAt` (모두 epoch ms)
- 연속 좌표(Point)가 아니라 **방문(Visit) 단위**다. iOS CLVisit 형태로, 도착~출발 구간이 이미 하나의 "머문 곳"이다.
- `departureAt: null` = 아직 그 장소에 머무는 중 (열린 방문)
- `receivedAt`은 출발 후 약 12분 뒤에 찍혀 있다. 데이터가 늦게 도착할 수 있다.
- `horizontalAccuracy`가 35~80m로 크다. 장소 매칭 반경 설계에 반영한다.
- 샘플의 좌표·시각(2030년)·음수 id는 마스킹된 가짜 값으로 보인다. 형식만 참고한다.
- 영향: 방문 사이의 이동 경로가 없으므로 지도 재생의 경로는 별도 수집이나 보간이 필요하다. 더미 데이터도 이 포맷으로 생성하는 것을 검토한다.
