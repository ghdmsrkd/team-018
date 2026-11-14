#!/bin/sh
# Copies the Lambda Function URL from an untracked env file into the built app's Info.plist
# (key HaruApiUrl). Sources, first match wins:
#   1. HARU_API_URL in the build environment
#   2. HARU_API_URL or EXPO_PUBLIC_API_URL in app/mobile/.env
#   3. the same keys in the repository root .env
# .env files are gitignored. The URL is never printed. Only https URLs are accepted.
set -e
URL="${HARU_API_URL:-}"
for f in "$SRCROOT/../.env" "$SRCROOT/../../../.env"; do
  if [ -z "$URL" ] && [ -f "$f" ]; then
    URL=$(grep -E '^(HARU_API_URL|EXPO_PUBLIC_API_URL)=' "$f" | tail -1 | cut -d= -f2- | tr -d "\"' \r")
  fi
done
PLIST="$TARGET_BUILD_DIR/$INFOPLIST_PATH"
/usr/libexec/PlistBuddy -c "Delete :HaruApiUrl" "$PLIST" >/dev/null 2>&1 || true
case "$URL" in
  *xxxxxxxx*) echo "note: API URL is the .env.example placeholder; ask/health stay disabled" ;;
  https://*)
    /usr/libexec/PlistBuddy -c "Add :HaruApiUrl string $URL" "$PLIST"
    echo "note: HaruApiUrl injected from local configuration" ;;
  "") echo "note: no API URL configured; ask/health stay disabled" ;;
  *) echo "warning: API URL ignored because it is not https" ;;
esac
