#!/usr/bin/env bash
# 하루 API Lambda 배포 (AWS CLI만 사용, 여러 번 실행해도 안전)
#   AWS_PROFILE=me-private-m1-mac-pro ./backend/scripts/deploy.sh
#   MODEL_ID=... 로 모델을 바꿀 수 있다 (기본 global.openai.gpt-6-luna)
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-me-private-m1-mac-pro}"
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_PAGER=""

FN="${FUNCTION_NAME:-haru-api}"
ROLE="${ROLE_NAME:-haru-api-role}"
MODEL_ID="${MODEL_ID:-global.openai.gpt-6-luna}"
RESERVED_CONCURRENCY="${RESERVED_CONCURRENCY:-5}"

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
echo "account=$ACCOUNT region=$AWS_REGION function=$FN model=$MODEL_ID"

# 1) 실행 역할: Bedrock 호출 권한만 (+ 로그)
FOUNDATION_ID="${MODEL_ID#global.}"
FOUNDATION_ID="${FOUNDATION_ID#apac.}"
POLICY=$(cat <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["bedrock:InvokeModel"],"Resource":[
  "arn:aws:bedrock:*::foundation-model/${FOUNDATION_ID}",
  "arn:aws:bedrock:*:${ACCOUNT}:inference-profile/${MODEL_ID}"]}]}
EOF
)
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "role created; waiting for IAM propagation"
  sleep 10
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name bedrock-invoke --policy-document "$POLICY"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"

# 2) 코드 압축
TMP="$(mktemp -d)"
( cd "$DIR/lambda" && zip -q -j "$TMP/fn.zip" index.mjs )

# 3) 함수 생성 또는 갱신
ENV_VARS="Variables={MODEL_ID=${MODEL_ID},MAX_TOKENS=1024}"
if [ -n "${KAKAO_REST_KEY:-}" ]; then
  ENV_VARS="Variables={MODEL_ID=${MODEL_ID},MAX_TOKENS=1024,KAKAO_REST_KEY=${KAKAO_REST_KEY}}"
fi
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$TMP/fn.zip" >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  aws lambda update-function-configuration --function-name "$FN" \
    --timeout 60 --memory-size 256 --environment "$ENV_VARS" >/dev/null
else
  aws lambda create-function --function-name "$FN" --runtime nodejs24.x --architectures arm64 \
    --handler index.handler --role "$ROLE_ARN" --timeout 60 --memory-size 256 \
    --environment "$ENV_VARS" --zip-file "fileb://$TMP/fn.zip" >/dev/null
fi
aws lambda wait function-active-v2 --function-name "$FN"
aws lambda wait function-updated-v2 --function-name "$FN"

# 4) 동시 실행 상한 (계정 한도가 작으면 건너뛴다)
if ! aws lambda put-function-concurrency --function-name "$FN" \
     --reserved-concurrent-executions "$RESERVED_CONCURRENCY" >/dev/null 2>&1; then
  echo "WARN: 예약 동시성을 설정하지 못했다 (계정 동시성 한도 확인 필요)"
fi

# 5) Function URL (인증 없음) + 공개 호출 권한
if ! aws lambda get-function-url-config --function-name "$FN" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$FN" --auth-type NONE >/dev/null
fi
aws lambda add-permission --function-name "$FN" --statement-id url-public-invoke-url \
  --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null 2>&1 || true
aws lambda add-permission --function-name "$FN" --statement-id url-public-invoke \
  --action lambda:InvokeFunction --principal '*' --invoked-via-function-url >/dev/null 2>&1 || true

URL="$(aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text)"
URL="${URL%/}"
printf '{"function":"%s","url":"%s","model":"%s","region":"%s"}\n' "$FN" "$URL" "$MODEL_ID" "$AWS_REGION" \
  > "$DIR/.deploy-state.json"
rm -rf "$TMP"

echo
echo "배포 완료"
echo "URL: $URL   (.env 의 EXPO_PUBLIC_API_URL 에 넣고, 저장소에는 올리지 않는다)"
echo "확인: curl -s $URL/health"
