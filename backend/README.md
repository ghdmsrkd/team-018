# backend

앱이 호출하는 Lambda 하나와 배포 스크립트. 인프라는 AWS CLI 스크립트로만 만든다 (CDK, Terraform 없음).

| 경로 | 내용 |
|---|---|
| `lambda/index.mjs` | `/chat` Bedrock Converse 중계, `/geocode` Kakao 중계, `/places/nearby` 주변 장소 조회, `/health` |
| `scripts/deploy.sh` | 실행 역할, 함수, Function URL, 동시성 상한을 만든다. 여러 번 실행해도 안전 |
| `scripts/smoke.sh` | 공개 좌표와 가상 질문으로 네 경로 확인 (Python 3 필요) |
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

기존 팀 함수의 코드만 교체할 때는 `lambda/index.mjs`를 ZIP 루트에 넣고, 계정·리전·함수 ARN을 확인한 뒤 `aws lambda update-function-code`와 `aws lambda wait function-updated-v2`를 실행한다. 확인한 함수의 `RevisionId`를 `--revision-id`로 전달하면 그 사이 변경된 함수에 덮어쓰는 것을 막을 수 있다. `deploy.sh`는 새 인프라 구성에도 쓰이므로 실행 역할, 모델 설정, 동시성, URL 권한까지 관리한다.

`API_URL`을 넘기면 별도 배포 상태 파일 없이 `backend/scripts/smoke.sh`를 실행할 수 있다. 이 스크립트는 `/health` 계약, 경복궁 좌표의 `/geocode` 및 `/places/nearby`, 가상 질문에 대한 Bedrock `query_sql` 요청을 확인한다. HTTP 또는 응답 계약 검증이 실패하면 종료 코드가 0이 아니다.

## `POST /places/nearby` (주변 장소 후보: Google Places API (New) 또는 Kakao Local)

방문 하나의 주변 POI 후보를 돌려준다. `/geocode`(Kakao 행정구역)와 별개다. 계약 타입은 `packages/schema/src/api.ts`의 `PlacesNearbyRequest` / `PlacesNearbyResponse` / `PlacesProvider`.

- 공급자 선택: `GOOGLE_PLACES_API_KEY`가 있으면 Google, 없고 `KAKAO_REST_KEY`만 있으면 Kakao. 둘 다 없으면 501 `places_not_configured`(외부 호출 없음). **한 요청의 좌표는 한 공급자에게만 간다.** `GET /health`의 `placesProvider`(`google` | `kakao` | `null`)로 앱이 검색 전에 어디로 보내는지 안내한다.
- 요청: `{ lat, lng, horizontalAccuracy }`만. 다른 필드가 있으면 400 `unexpected_field`. 좌표 범위·숫자형, 정확도 0~5000m를 검사한다.
- 반경: `horizontalAccuracy`를 50~300m로 제한한 값.
- Google: Nearby Search (New), `rankPreference: DISTANCE`, `maxResultCount: 10`, `languageCode: ko`. Field mask `places.id,places.displayName,places.formattedAddress,places.location,places.attributions`.
- Kakao: `GET /v2/local/search/category.json`, `x=lng`, `y=lat`, `radius`(반올림 정수), `sort=distance`. `category_group_code`가 필수라 고정 7개(`FD6` 음식점, `CE7` 카페, `CS2` 편의점, `MT1` 대형마트, `CT1` 문화시설, `AT4` 관광명소, `AD5` 숙박)를 병렬로 조회해 합친다. 일부 카테고리만 실패하면 나머지 결과와 `incomplete: true`, 모두 실패하면 오류.
- 응답: `{ places: [{ id, provider, name, address, lat, lng, distanceMeters, attributions? }], radiusMeters, provider, source: "google_places" | "kakao_local", incomplete? }`. 요청 좌표에서 직선거리(m) 가까운 순, id 중복 제거, 최대 10개. 결과가 없으면 `places: []`(200).
- 오류: 공급자 오류 502/429 `places_error`(`provider`, `detail: upstream_<status>`), 시간 초과 504. 로그에는 공급자와 상태 코드만 남기고 좌표·키·응답 본문은 남기지 않는다.
- 앱 저장 형식: 장소 ID만 저장한다. Google ID는 그대로(이전에 저장한 ID와 호환), Kakao id는 `kakao:<id>`.
- 키: Lambda 환경변수 `GOOGLE_PLACES_API_KEY` / `KAKAO_REST_KEY`에만 둔다. 저장소·앱에 두지 않는다.
- 배포: `deploy.sh`는 키를 넘기면(`KAKAO_REST_KEY=... ./backend/scripts/deploy.sh`) 그 값으로, 넘기지 않으면 이미 배포된 함수의 값을 보존한다. 환경변수는 권한 600 임시 JSON 파일로 넘기고, 키 값은 출력하지 않는다(설정 여부 set/unset과 선택된 공급자만 출력). 키를 지우려면 콘솔이나 `aws lambda update-function-configuration`으로 직접 지운다.
- 2026-11-14 서울 리전 팀 `haru-api`의 코드 갱신 후 네 경로를 확인했다. `/health`의 공급자는 Kakao였고 경복궁 좌표에서 후보 1개가 돌아왔다. `/chat`은 Haiku 4.5의 `query_sql` 도구 요청까지 확인했다.
- 선행 "장소 제안" 계약(방문 → 장소 자동 추정 결과 unknown/failed 등)은 아직 백엔드에도 앱에도 없다. 지금은 앱에서 사용자가 버튼을 누를 때만 이 후보 조회를 호출한다.
