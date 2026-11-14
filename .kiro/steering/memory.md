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

## Git
- Git 작업은 에이전트가 전부 처리한다.
- 의미 있는 작업 단위마다 중간중간 커밋한다.
- 커밋 후 GitHub(`origin`, `https://github.com/ghdmsrkd/team-018.git`)에 푸시한다.
- 시크릿(액세스 키, 토큰 등)은 절대 커밋하지 않는다.
