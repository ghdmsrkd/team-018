#!/usr/bin/env bash
# 하루 API 리소스 삭제 (Lambda, Function URL, 실행 역할). 비용 차단이 필요할 때 쓴다.
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-me-private-m1-mac-pro}"
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_PAGER=""
FN="${FUNCTION_NAME:-haru-api}"
ROLE="${ROLE_NAME:-haru-api-role}"

aws lambda delete-function-url-config --function-name "$FN" 2>/dev/null || true
aws lambda delete-function --function-name "$FN" 2>/dev/null || true
aws iam delete-role-policy --role-name "$ROLE" --policy-name bedrock-invoke 2>/dev/null || true
aws iam detach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true
aws iam delete-role --role-name "$ROLE" 2>/dev/null || true
rm -f "$(cd "$(dirname "$0")/.." && pwd)/.deploy-state.json"
echo "삭제 완료"
