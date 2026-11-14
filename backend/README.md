# backend

앱이 호출하는 Lambda 하나와 배포 스크립트. 인프라는 AWS CLI 스크립트로만 만든다 (CDK, Terraform 없음).

| 경로 | 내용 |
|---|---|
| `lambda/index.mjs` | `/chat` Bedrock Converse 중계, `/geocode` Kakao 중계, `/health` |
| `scripts/deploy.sh` | 실행 역할, 함수, Function URL, 동시성 상한을 만든다. 여러 번 실행해도 안전 |
| `scripts/smoke.sh` | 배포 확인. `/health` 와 도구 호출 한 번 |
| `scripts/teardown.sh` | 모두 삭제 (비용 차단용) |

```bash
# 배포 (기본: 개인 프로필, 서울 리전)
./backend/scripts/deploy.sh
MODEL_ID=global.openai.gpt-6-luna ./backend/scripts/deploy.sh   # 모델 지정
./backend/scripts/smoke.sh
```

- 배포하면 `backend/.deploy-state.json`(gitignore)에 URL이 저장된다. 이 URL은 `.env`의 `EXPO_PUBLIC_API_URL`에 넣고 저장소에는 올리지 않는다.
- 모델 ID와 `maxTokens`는 Lambda 환경변수로 고정된다. 앱이 보낸 값은 무시한다.
- 요청 본문은 로그에 남기지 않는다 (위치 데이터가 들어 있을 수 있다).
- API 계약 타입은 `packages/schema/src/api.ts`.
