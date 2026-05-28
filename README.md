# HappyMap

서울시 청년·공공 매입임대주택 공고 데이터를 지도에서 검색하고 비교하는 웹 서비스입니다.

Kakao Maps 기반 지도, 조건 필터, 보증금/월세 전환, 회사까지 자동차 소요시간 계산, 데이터셋 업로드, 카카오 로그인 기반 좋아요/댓글 기능을 제공합니다.

## Features

- 서울시 매입임대주택 매물 지도 시각화
- 자치구, 전용면적, 보증금, 월세, 방 개수, 승강기 필터
- 주소, 단지번호, 호수 검색
- Kakao Maps marker clustering
- 회사 위치 기준 자동차 소요시간 계산
- 소요시간 캐시를 SQLite에 저장해 Kakao API 호출 절감
- 보증금/월세 전환 계산
- PDF 또는 Excel 공고 파일에서 데이터셋 생성
- 서버 파일시스템 기반 데이터셋 저장/목록 조회
- 카카오 로그인
- 매물별 좋아요와 댓글
- 다크모드와 모바일 지도/목록 전환 UI

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Map: Kakao Maps JavaScript SDK
- API: Node.js, Express
- Database: SQLite, better-sqlite3
- Auth: Kakao OAuth, JWT cookie
- Data parsing: SheetJS for Excel, pdf.js + optional Ollama for PDF cleanup
- Deployment: Node server, Caddy, DuckDNS

## Quick Start

```bash
git clone https://github.com/ghyen/happyMap.git
cd happyMap

npm install
cp .env.example .env
```

Fill environment variables:

```bash
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000

KAKAO_MAP_API_KEY=your_kakao_map_javascript_key
KAKAO_REST_API_KEY=your_kakao_rest_api_key
JWT_SECRET=your_random_secret
```

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|---|---:|---|
| `PORT` | No | Express server port. Default `3000` |
| `NODE_ENV` | No | `development` or `production` |
| `BASE_URL` | Yes | Public callback base URL for Kakao OAuth |
| `KAKAO_MAP_API_KEY` | Yes | Kakao Maps JavaScript API key |
| `KAKAO_REST_API_KEY` | Yes | Kakao REST API key for OAuth, local search, navigation |
| `JWT_SECRET` | Yes | JWT signing secret for login cookie |
| `OLLAMA_URL` | No | Ollama endpoint for PDF parsing. Default `http://localhost:11434` |
| `OLLAMA_MODEL` | No | Ollama model for PDF cleanup. Default `gemma4:e4b` |

The server generates `js/config.js` at startup from `KAKAO_MAP_API_KEY` and `KAKAO_REST_API_KEY`.

## Data Format

Main property data lives in JSON files under:

```text
data/
data/datasets/
```

Each property has this shape:

```json
{
  "id": 1,
  "district": "강남구",
  "propertyId": "강남01",
  "address": "서울특별시 강남구 ...",
  "unit": "303",
  "exclusiveArea": 25.39,
  "rooms": 1,
  "elevator": true,
  "deposit": 67810000,
  "monthlyRent": 61600,
  "lat": 37.5,
  "lng": 127.0,
  "commuteMin": 35
}
```

## Dataset Upload

The settings panel supports creating a new dataset from:

- Excel: structured LH-style sheets parsed in the browser with SheetJS
- PDF: PDF text extraction, then optional LLM cleanup through `/api/parse-pdf`

Saved datasets are exposed by:

```http
GET  /api/datasets
POST /api/datasets
```

## API

Auth:

```http
GET /api/auth/kakao
GET /api/auth/callback
GET /api/auth/me
GET /api/auth/logout
```

Social:

```http
GET    /api/social/:dataset/:address
POST   /api/social/:dataset/:address/like
POST   /api/social/:dataset/:address/comment
DELETE /api/social/comment/:id
GET    /api/social/:dataset/counts
```

Commute cache:

```http
POST /api/commute/lookup
POST /api/commute/cache
```

Parsing and datasets:

```http
POST /api/parse-pdf
GET  /api/datasets
POST /api/datasets
```

## Project Structure

```text
happyMap/
|-- index.html              # app shell
|-- server.js               # Express API, auth, SQLite, dataset storage
|-- css/style.css           # responsive UI and map/list layout
|-- js/
|   |-- app.js              # main UI orchestration
|   |-- map.js              # Kakao map setup and viewport helpers
|   |-- markers.js          # markers, overlays, social section injection
|   |-- filters.js          # property filters
|   |-- settings.js         # dataset, office location, commute, price conversion
|   |-- excel-parser.js     # Excel to property data
|   |-- pdf-parser.js       # PDF text extraction
|   |-- auth.js             # Kakao login UI
|   `-- social.js           # likes and comments UI
|-- data/properties.json    # default property dataset
|-- parse_properties.py     # offline parsing helper
|-- geocode_properties.py   # offline geocoding helper
`-- DEPLOYMENT_CHECKLIST.md # deployment notes
```

## Deployment Notes

Production values should use HTTPS in `BASE_URL`, because Kakao OAuth callback and secure cookies depend on the deployed origin.

Example:

```bash
PORT=3000
NODE_ENV=production
BASE_URL=https://happymap.duckdns.org
```

`Caddyfile` can be used as a reverse proxy entrypoint:

```text
happymap.duckdns.org {
    reverse_proxy localhost:3000
}
```

## Notes

- `data/social.db` stores likes, comments, and commute cache.
- The repository includes a default Seoul housing dataset in `data/properties.json`.
- Uploaded datasets are saved under `data/datasets`.
- Large raw public announcement files are not required for runtime.

## License

No license file has been added yet.
