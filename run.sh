#!/bin/bash

PORT=5000
DIR="$(cd "$(dirname "$0")" && pwd)"

# 기존 프로세스 종료
lsof -ti:$PORT | xargs kill -9 2>/dev/null

echo "서울시 장기미임대 매입임대주택 지도"
echo "=================================="
echo ""
echo "서버 시작 중..."
echo "URL: http://localhost:$PORT"
echo ""
echo "종료하려면 Ctrl+C를 누르세요."
echo ""

cd "$DIR"
python3 -m http.server $PORT
