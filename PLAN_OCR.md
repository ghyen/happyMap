# PDF → 데이터셋 자동 생성 계획

## 현황

- 원본 PDF: SH공사 공고문 (디지털 PDF, 텍스트 추출 가능 → OCR 불필요)
- 테이블 컬럼: 연번, 자치구, 단지번호, 주소, 호, 전용면적, 방개수, 승강기, 임대보증금, 월임대료, 전환예시(4열)
- 현재 데이터: `data/properties.json` (261건, 수동 생성 + 지오코딩 완료)
- 목표: 설정에서 PDF 업로드 → 파싱 → 지오코딩 → 드롭다운에 새 데이터셋 추가

## 기술 스택

- **pdf.js** (CDN) — PDF 텍스트 추출
- **Kakao Local API** — 주소 → 좌표 변환 (기존 settings.js에 geocode() 있음)
- **IndexedDB** — 생성된 데이터셋 저장 (localStorage는 5MB 제한)

---

## Phase 1: PDF 업로드 UI

- [x] 설정 패널에 "데이터셋 생성" 섹션 추가 (파일 input + 버튼)
- [x] PDF 파일 선택 시 파일명 표시
- [x] 진행 상태 표시 영역 (단계별 progress)

## Phase 2: PDF 텍스트 추출

- [x] pdf.js CDN 스크립트 추가 (동적 import 방식)
- [x] PDF 로드 → 전체 페이지 텍스트 추출
- [x] 테이블 시작 감지 (헤더 행: "연번", "자치구", "단지번호" 패턴)
- [x] 테이블 종료 감지 (빈 행 or 페이지 끝)

## Phase 3: 테이블 파싱 & 데이터 변환

- [x] 행 단위로 분리 (정규식 기반, 숫자 시작 행 = 데이터 행)
- [x] 컬럼 매핑:
  - 연번 → `id`
  - 자치구("강남") → `district`("강남구")
  - 단지번호 → `propertyId`
  - 주소 → `address` ("서울특별시 " + 자치구 + 나머지)
  - 호 → `unit`
  - 전용면적 → `exclusiveArea` (float)
  - 방개수 → `rooms` (int)
  - 승강기(○/X) → `elevator` (bool)
  - 임대보증금 → `deposit` (int, 쉼표 제거)
  - 월임대료 → `monthlyRent` (int, 쉼표 제거)
- [x] 파싱 결과 검증 (행 수, 필수 필드 누락 체크)
- [x] 파싱 실패 행 목록 표시 (console.warn)

## Phase 4: 지오코딩 (주소 → 좌표)

- [x] 고유 주소 추출 (같은 주소 중복 요청 방지)
- [x] Kakao Local API로 batch 지오코딩 (기존 geocode() 재사용)
- [x] API rate limit 적용 (200ms 딜레이, 기존 설정 재사용)
- [x] 진행률 표시 ("지오코딩 중... 45/120 주소")
- [ ] 실패 주소 목록 표시 & 수동 재시도 옵션 (console.warn만 구현, UI 미구현)

## Phase 5: 저장 & 드롭다운 연동

- [x] IndexedDB에 데이터셋 저장 (키: 데이터셋 이름)
- [x] 데이터셋 이름 자동 생성 (PDF 파일명 기반) + 사용자 수정 가능
- [x] 드롭다운(`#dataset-select`)에 저장된 데이터셋 옵션 추가
- [x] 앱 초기화 시 IndexedDB에서 저장된 데이터셋 목록 로드
- [ ] 저장된 데이터셋 삭제 기능 (미구현)

---

## 파일 변경 예상

| 파일 | 변경 내용 |
|------|----------|
| `index.html` | pdf.js CDN, 업로드 UI 섹션 |
| `css/style.css` | 업로드/진행률 스타일 |
| `js/pdf-parser.js` | **신규** — PDF 로드, 텍스트 추출, 테이블 파싱 |
| `js/dataset-store.js` | **신규** — IndexedDB CRUD |
| `js/settings.js` | 업로드 이벤트, 드롭다운 연동, 지오코딩 호출 |

## 주의사항

- PDF 포맷이 바뀌면 파싱 로직 수정 필요 (헤더 패턴 기반으로 유연하게)
- 지오코딩은 주소 수에 비례해서 시간 소요 (120개 고유주소 × 200ms ≈ 24초)
- Kakao API 일일 호출 제한 확인 필요
- pdf.js는 ~500KB, CDN으로 로드하되 설정 패널 열 때 lazy load 고려
