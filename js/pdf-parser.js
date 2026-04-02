/**
 * PDF 파싱 모듈
 * SH공사 공고문 PDF에서 매물 테이블을 추출하여 properties 배열로 변환
 */
const PdfParser = (function() {

    /**
     * pdf.js 로드 대기
     */
    async function loadPdfJs() {
        if (window.pdfjsLib) return window.pdfjsLib;

        // ESM CDN 대신 UMD 버전 사용
        return new Promise((resolve, reject) => {
            // 이미 로드된 경우
            if (window.pdfjsLib) return resolve(window.pdfjsLib);

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs';
            script.type = 'module';
            script.onload = () => {
                // module이라 global에 안 잡힐 수 있음, fallback
                setTimeout(() => resolve(window.pdfjsLib), 100);
            };
            script.onerror = () => reject(new Error('pdf.js 로드 실패'));
            document.head.appendChild(script);
        });
    }

    /**
     * PDF 파일에서 전체 텍스트를 페이지별로 추출
     */
    async function extractText(file, onProgress) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = window.pdfjsLib || await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs');

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();

            // 텍스트 아이템을 y좌표 기준으로 행 단위로 그룹화
            const items = content.items.filter(item => item.str.trim());
            const rows = groupIntoRows(items);
            pages.push({ pageNum: i, rows });

            if (onProgress) onProgress(i, pdf.numPages);
        }

        return pages;
    }

    /**
     * 텍스트 아이템을 y좌표 기준으로 행으로 그룹화
     */
    function groupIntoRows(items) {
        if (items.length === 0) return [];

        // y좌표(transform[5]) 기준 그룹화, 허용 오차 3px
        const rowMap = new Map();
        const tolerance = 3;

        items.forEach(item => {
            const y = Math.round(item.transform[5]);
            let matchedKey = null;
            for (const key of rowMap.keys()) {
                if (Math.abs(key - y) <= tolerance) {
                    matchedKey = key;
                    break;
                }
            }
            const key = matchedKey != null ? matchedKey : y;
            if (!rowMap.has(key)) rowMap.set(key, []);
            rowMap.get(key).push(item);
        });

        // y좌표 내림차순 (PDF 좌표계: 아래에서 위), x좌표 오름차순 정렬
        return Array.from(rowMap.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([, items]) =>
                items.sort((a, b) => a.transform[4] - b.transform[4])
                    .map(i => i.str.trim())
                    .filter(Boolean)
            );
    }

    /**
     * 추출된 페이지 데이터에서 매물 테이블 행 파싱
     */
    function parseTable(pages) {
        const properties = [];
        const errors = [];

        for (const page of pages) {
            for (const row of page.rows) {
                if (row.length < 7) continue;
                const firstCell = row[0];
                // 연번: "1" 또는 "A1" 형식 모두 매칭
                if (!firstCell || !/^[A-Za-z]?\d+$/.test(firstCell)) continue;

                try {
                    const parsed = parseRow(row);
                    if (parsed) properties.push(parsed);
                } catch (e) {
                    errors.push({ row: row.join(' | '), page: page.pageNum, error: e.message });
                }
            }
        }

        return { properties, errors };
    }

    /**
     * 단일 행을 property 객체로 변환
     *
     * 전용면적(소수점 숫자)을 기준점으로 사용하여 컬럼 위치를 결정.
     * 두 가지 PDF 형식을 자동 감지:
     *   형식1: 연번(숫자) | 자치구 | 단지번호 | 주소... | 호 | 면적 | ...
     *   형식2: 연번(A1) | 구 | 주소... | 호 | 면적 | ...
     */
    function parseRow(cells) {
        if (cells.length < 7) return null;

        // 전용면적(소수점 숫자, 5~500 범위)을 기준점으로 탐색
        let areaIdx = -1;
        let exclusiveArea = 0;
        for (let i = 2; i < cells.length; i++) {
            if (/^\d+\.\d+$/.test(cells[i])) {
                const val = parseFloat(cells[i]);
                if (val >= 5 && val <= 500) {
                    areaIdx = i;
                    exclusiveArea = val;
                    break;
                }
            }
        }
        if (areaIdx === -1) return null;

        const rawId = cells[0];
        const id = parseInt(rawId.replace(/\D/g, ''));
        const district = cells[1] + (cells[1].endsWith('구') ? '' : '구');

        // 형식 감지: 연번이 숫자만이면 단지번호 컬럼 있음 (형식1), 아니면 없음 (형식2)
        const hasPropertyIdCol = /^\d+$/.test(rawId);
        const propertyId = hasPropertyIdCol ? cells[2] : rawId;
        const addressStart = hasPropertyIdCol ? 3 : 2;

        // 호: 전용면적 바로 앞
        const unitIdx = areaIdx - 1;
        if (unitIdx < addressStart) return null;
        const unit = cells[unitIdx];

        // 주소
        const addressParts = cells.slice(addressStart, unitIdx);
        let address = addressParts.join(' ');
        if (!address.startsWith('서울')) {
            address = '서울특별시 ' + district + ' ' + address;
        }

        // 전용면적 이후: [방개수], [승강기], 가격들
        let cursor = areaIdx + 1;

        // 방개수 (1자리 정수, 1-9)
        let rooms = null;
        if (cursor < cells.length && /^[1-9]$/.test(cells[cursor])) {
            rooms = parseInt(cells[cursor]);
            cursor++;
        }

        // 승강기 (비숫자 마커 — 어떤 문자든 위치로 판별)
        let elevator = null;
        if (cursor < cells.length) {
            const cleaned = cells[cursor].replace(/,/g, '');
            if (!/^\d+$/.test(cleaned)) {
                elevator = !/[Xx×✕✖]/.test(cells[cursor]);
                cursor++;
            }
        }

        // 나머지: 임대보증금, 월임대료, (전환 컬럼들)
        const prices = cells.slice(cursor)
            .map(s => s.replace(/,/g, ''))
            .filter(s => /^\d+$/.test(s))
            .map(Number);

        if (prices.length < 2) return null;

        const deposit = prices[0];
        const monthlyRent = prices[1];

        if (isNaN(id) || isNaN(exclusiveArea) || isNaN(deposit) || isNaN(monthlyRent)) {
            return null;
        }

        return {
            id, district, propertyId, address,
            unit: String(unit),
            exclusiveArea, rooms, elevator,
            deposit, monthlyRent,
            lat: null, lng: null, commuteMin: null
        };
    }

    /**
     * 전체 파이프라인: PDF File → properties 배열
     */
    async function parse(file, onProgress) {
        if (onProgress) onProgress('PDF 텍스트 추출 중...', 0);

        const pages = await extractText(file, (done, total) => {
            if (onProgress) onProgress(`텍스트 추출 중... (${done}/${total} 페이지)`, done / total * 50);
        });

        if (onProgress) onProgress('테이블 파싱 중...', 50);
        const { properties, errors } = parseTable(pages);

        if (onProgress) onProgress(`파싱 완료: ${properties.length}건`, 60);

        return { properties, errors };
    }

    return { parse };
})();
