#!/bin/sh
# Compiles the app's VisitStore and VisitPlaceMatcher with a test main on macOS and runs it.
set -e
cd "$(dirname "$0")"
OUT="${TMPDIR:-/tmp}/team018-native-tests"
xcrun swiftc -O -o "$OUT" \
  ../Team018Mobile/VisitPlaceMatcher.swift \
  ../Team018Mobile/VisitStore.swift \
  main.swift -lsqlite3
"$OUT"
