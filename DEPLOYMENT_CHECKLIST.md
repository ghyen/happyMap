# HappyMap 배포 체크리스트 & 트래픽 대응 가이드

> 대상: 일 최대 10,000명 트래픽 기준
> 현재 구조: Vercel 정적 호스팅 + 클라이언트 사이드 SPA

---

## 1. API 키 보안 (긴급)

### 현재 문제
- `KAKAO_REST_API_KEY`가 클라이언트 JS에 노출 (`config.js`)
- 브라우저 개발자 도구에서 누구나 API 키를 복사 가능
- 1만명이 사용하면 악의적 사용자가 키를 탈취해 과도한 API 호출 가능

### 해결 방법
- **Kakao 개발자 콘솔에서 도메인 제한 설정** (필수, 즉시)
  - 플랫폼 > Web에서 허용 도메인만 등록 (예: `happymap.vercel.app`)
  - 이렇게 하면 다른 도메인에서 키를 사용할 수 없음
- **REST API 호출은 서버사이드 프록시로 전환** (권장)
  - Vercel Serverless Function (`/api/geocode`, `/api/directions`)을 만들어서 REST API 키는 서버에만 보관
  - 클라이언트는 프록시 엔드포인트만 호출
  - Maps SDK appkey는 도메인 제한만으로 충분

### 참고
```
현재 노출되는 키:
- CONFIG.KAKAO_MAP_API_KEY → Maps SDK용 (도메인 제한으로 방어 가능)
- CONFIG.KAKAO_REST_API_KEY → REST API용 (프록시 전환 권장)
```

---

## 2. Kakao API 일일 할당량 초과 위험

### 현재 문제
- Kakao API 무료 플랜: 일 300,000회 (지도 SDK), 일 100,000회 (REST API)
- 사용자가 PDF 업로드 시 지오코딩 → 주소 수만큼 API 호출 (200ms 간격)
- 소요시간 재계산 → 고유 좌표 수만큼 Navi API 호출
- 1만명 중 100명만 PDF 업로드해도: 100명 x 100주소 = 10,000회 지오코딩

### 해결 방법
- **기본 데이터셋은 이미 지오코딩 완료** (`data/properties.json`)이므로 대부분 사용자는 API를 거의 안 씀 → 현재 구조로도 충분할 수 있음
- 지오코딩/경로 결과를 **서버사이드 캐시** (KV Store 등)에 저장해서 동일 주소 재요청 방지
- Kakao API 사용량 모니터링 대시보드 설정
- 임계값 초과 시 알림 설정 (Kakao 개발자 콘솔)

---

## 3. 정적 에셋 최적화

### 현재 문제
- JS 파일 7개가 개별 `<script>` 태그로 동기 로딩 → 렌더 블로킹
- CSS/JS 미니파이 안 됨 (style.css 1,191줄, 전체 JS ~1,750줄)
- `properties.json` (~105KB) 매 방문마다 fetch
- 빌드 도구(번들러) 없음

### 해결 방법

#### 즉시 적용 가능 (빌드 도구 없이)
- **JS에 `defer` 속성 추가**: 렌더 블로킹 방지
  ```html
  <!-- 현재 -->
  <script src="js/app.js"></script>
  <!-- 개선 -->
  <script src="js/app.js" defer></script>
  ```
- **Vercel 캐싱 헤더 설정** (`vercel.json`):
  ```json
  {
    "headers": [
      {
        "source": "/data/(.*)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400, s-maxage=86400" }]
      },
      {
        "source": "/css/(.*)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      },
      {
        "source": "/js/(.*)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      }
    ]
  }
  ```
  - 단, immutable 캐싱 사용 시 파일명에 해시를 포함하거나 버전 쿼리스트링 필요 (예: `style.css?v=2`)

#### 중기 개선 (선택)
- Vite 등 빌드 도구 도입으로 JS/CSS 번들링 + 미니파이
- 현재 코드 규모가 작아서 (JS 전체 ~1,750줄) 효과는 크지 않음

---

## 4. 불필요한 파일 배포 차단

### 현재 문제
- `vercel.json`의 `outputDirectory: "."` → 프로젝트 루트 전체가 배포됨
- Python 스크립트 (`parse_properties.py`, `geocode_properties.py`), PDF 파일, `.env.example` 등이 공개 접근 가능
- `todo.md`, `proposal.md` 등 내부 문서도 노출

### 해결 방법
- **`.vercelignore` 파일 생성**:
  ```
  *.py
  *.pdf
  .env*
  todo.md
  proposal.md
  PLAN_OCR.md
  DEPLOYMENT_CHECKLIST.md
  ```
- 또는 빌드 시 `public/` 디렉토리에 필요한 파일만 복사하고 `outputDirectory: "public"` 사용

---

## 5. SEO & 소셜 공유 메타태그 ✅ 완료

### 적용 내용
- ✅ `<meta description>` 추가 (`index.html`)
- ✅ Open Graph 태그 추가 (`og:title`, `og:description`, `og:type`, `og:locale`)
- ✅ `robots.txt` 생성
- ⬜ favicon 추가 (파일 준비 후 `<link rel="icon">` 태그 추가 필요)
- ⬜ `og:image` 추가 (스크린샷 이미지 준비 후 추가 필요)
- ⬜ `sitemap.xml` 추가 (단일 페이지이므로 우선순위 낮음)

---

## 6. 에러 처리 & 모니터링 ✅ 완료

### 적용 내용
- ✅ 전역 에러 핸들러 추가 (`app.js`) — JS 에러/unhandled rejection 시 로딩 화면 자동 해제
- ✅ Kakao Maps SDK 로드 실패 시 안내 메시지 표시 (`config.js` reject + `app.js` catch)
- ⬜ 에러 모니터링 서비스 도입 검토 (Sentry 무료 플랜 등)

---

## 7. Vercel 호스팅 제한

### 현재 문제 (Free 플랜 기준)
- 대역폭: 100GB/월
- Serverless Function 실행 시간: 10초
- 일 10,000명 x 페이지 로드 시 전송량:
  - `index.html` (~5KB) + `style.css` (~25KB) + JS 전체 (~35KB) + `properties.json` (~105KB) = ~170KB
  - gzip 적용 시 ~50KB
  - 10,000 x 50KB = ~500MB/일 = ~15GB/월 → **Free 플랜으로 충분**
- 단, 브라우저 캐시 미적용 시 재방문마다 다운로드 → 캐시 헤더 설정 필수

### 해결 방법
- 캐시 헤더 설정 (섹션 3 참고)으로 재방문 트래픽 대폭 절감
- Vercel Pro 플랜으로 전환 시 대역폭 1TB/월
- 현재 트래픽 수준에서는 Free 플랜으로 운영 가능

---

## 8. 초기 로딩 성능 (Core Web Vitals)

### 현재 문제
- Kakao Maps SDK (~300KB)가 로드될 때까지 지도 영역 빈 화면
- JS 파일이 `defer` 없이 동기 로드 → FCP 지연
- 모바일에서 초기 로딩 시간이 길 수 있음

### 해결 방법
- **JS `defer` 속성 추가** (즉시, 섹션 3 참고)
- **스켈레톤 UI**: 지도 로딩 중 더 나은 로딩 인디케이터 표시 (현재 스피너는 있음, OK)
- **properties.json 사이즈 최적화**: 불필요한 필드 제거, 숫자 키 축약 검토
  - 현재 105KB → gzip 시 ~20KB이므로 큰 문제는 아님
- Vercel Speed Insights로 Core Web Vitals 모니터링 (이미 설정됨)

---

## 9. 모바일 트래픽 대응

### 현재 상태
- 모바일 반응형 구현 완료 (목록/지도 전환)
- 768px 이하 breakpoint 적용

### 주의할 점
- 1만명 중 70%+ 가 모바일일 가능성 높음 (한국 사용자 패턴)
- 모바일에서 설정 패널(`#settings-panel`)이 `display: none` → PDF 업로드, 테마 변경 등 설정 기능 모바일에서 사용 불가
- 지도 타일 로딩이 모바일 데이터에서 느릴 수 있음

### 해결 방법
- 모바일 설정 접근 방법 추가 (하단 메뉴 또는 햄버거 메뉴)
- 터치 인터랙션 최적화 확인 (현재 기본적으로 처리됨)

---

## 10. XSS & 보안

### 현재 문제
- `innerHTML`을 사용하는 곳이 다수 (`renderList`, `createMultiUnitInfoWindowContent` 등)
- 데이터 출처가 `properties.json` (통제 가능) 또는 PDF 파싱 결과 (사용자 입력)
- PDF에서 파싱된 주소/단지번호에 악의적 스크립트가 포함될 가능성

### 해결 방법
- PDF 파싱 결과를 렌더링 전에 이스케이프 처리:
  ```javascript
  function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
  }
  ```
- `Content-Security-Policy` 헤더 추가 (`vercel.json`):
  ```json
  {
    "source": "/(.*)",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "default-src 'self'; script-src 'self' dapi.kakao.com *.kakao.com /_vercel/; style-src 'self' 'unsafe-inline'; img-src 'self' *.kakao.com *.daumcdn.net data:; connect-src 'self' dapi.kakao.com apis-navi.kakaomobility.com"
    }]
  }
  ```

---

## 11. 접근성 (Accessibility)

### 현재 문제
- `<img>` 태그는 없지만 지도 마커에 alt 텍스트 부재
- 키보드 네비게이션 제한적
- 스크린리더 지원 미흡

### 해결 방법 (기본)
- 주요 인터랙티브 요소에 `aria-label` 추가
- `<h1>`, `<h2>` 등 heading 구조는 현재 적절함
- 지도 자체는 접근성 한계가 있으므로, 목록 뷰가 접근성 대안 역할 (현재 구조 OK)

---

## 12. 트래픽 급증 시 예상 시나리오

### 시나리오 A: 청년임대 공고 발표 직후
- **예상**: 단기간 동시 접속 폭증 (수천명/시간)
- **영향**: Vercel 정적 호스팅은 CDN 기반이라 정적 에셋은 문제 없음
- **위험**: Kakao Maps SDK CDN에 의존 → Kakao 측 장애 시 지도 전체 불능
- **대비**: Kakao SDK 로드 실패 시 "지도를 불러올 수 없습니다" 안내 메시지 표시

### 시나리오 B: SNS/커뮤니티 바이럴
- **예상**: 지속적 트래픽 증가
- **영향**: 대역폭 사용량 증가
- **대비**: 캐시 헤더 설정, Vercel Analytics로 트래픽 모니터링

### 시나리오 C: PDF 업로드 동시 다발
- **예상**: 새 공고 PDF가 나오면 다수 사용자가 동시에 업로드
- **영향**: Kakao REST API 할당량 급소진 가능
- **대비**: 새 공고 데이터를 미리 `properties.json`으로 제공하여 PDF 업로드 필요성 최소화

---

## 우선순위별 액션 아이템

### P0 - 배포 전 필수
| # | 항목 | 작업량 |
|---|------|--------|
| 1 | Kakao 개발자 콘솔에서 도메인 제한 설정 | 5분 |
| 2 | `.vercelignore` 생성하여 불필요 파일 차단 | 5분 |
| 3 | `vercel.json`에 캐시 헤더 추가 | 10분 |

### P1 - 배포 후 1주 내
| # | 항목 | 작업량 |
|---|------|--------|
| ~~4~~ | ~~SEO 메타태그 & Open Graph 태그 추가~~ | ✅ |
| ~~5~~ | ~~전역 에러 핸들러 추가~~ | ✅ |
| 6 | JS `defer` 속성 추가 | 5분 |
| 7 | `innerHTML` XSS 방어 (escapeHtml) | 30분 |

### P2 - 트래픽 증가 후 대응
| # | 항목 | 작업량 |
|---|------|--------|
| 8 | REST API 프록시 (Vercel Serverless Function) | 2~3시간 |
| 9 | 모바일 설정 패널 접근 | 1~2시간 |
| 10 | CSP 헤더 추가 | 30분 |
| 11 | 에러 모니터링 서비스 연동 | 1시간 |

### P3 - 선택적 개선
| # | 항목 | 작업량 |
|---|------|--------|
| 12 | Vite 빌드 도구 도입 | 2~3시간 |
| 13 | 접근성 개선 | 1~2시간 |
| 14 | robots.txt & sitemap | 10분 |
