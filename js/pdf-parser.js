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
                // 데이터 행: 첫 번째 셀이 숫자(연번)
                const firstCell = row[0];
                if (!firstCell || !/^\d+$/.test(firstCell)) continue;

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
     * PDF 테이블 컬럼 순서:
     * 연번 | 자치구 | 단지번호 | 주소 | 호 | 전용면적 | 방개수 | 승강기 | 임대보증금 | 월임대료 | (전환 4열)
     *
     * 텍스트 추출 시 주소에 공백이 포함되어 여러 셀로 나뉠 수 있으므로
     * 앞 3개(연번,자치구,단지번호)와 뒤 숫자열을 고정하고 중간을 주소로 합침
     */
    function parseRow(cells) {
        if (cells.length < 8) return null;

        // 뒤에서부터 숫자 셀 수집 (최소 6개: 보증금,월세 + 전환4열, 승강기 앞까지)
        // 승강기 여부(○/X)를 기준점으로 사용
        let elevatorIdx = -1;
        for (let i = 3; i < cells.length; i++) {
            if (cells[i] === '○' || cells[i] === 'O' || cells[i] === 'X') {
                // 바로 앞이 숫자(방개수)인지 확인
                if (i >= 1 && /^\d+$/.test(cells[i - 1])) {
                    elevatorIdx = i;
                    break;
                }
            }
        }

        if (elevatorIdx === -1) return null;

        const id = parseInt(cells[0]);
        const district = cells[1] + (cells[1].endsWith('구') ? '' : '구');
        const propertyId = cells[2];

        // 호 = elevatorIdx - 2, 방개수 = elevatorIdx - 1
        const roomsIdx = elevatorIdx - 1;
        const unitIdx = roomsIdx - 1;
        const areaIdx = unitIdx - 1;

        // 주소: cells[3] ~ cells[areaIdx - 1]
        const addressParts = cells.slice(3, areaIdx);
        let address = addressParts.join(' ');
        if (!address.startsWith('서울')) {
            address = '서울특별시 ' + district + ' ' + address;
        }

        const unit = cells[unitIdx];
        const exclusiveArea = parseFloat(cells[areaIdx]);
        const rooms = parseInt(cells[roomsIdx]);
        const elevator = cells[elevatorIdx] === '○' || cells[elevatorIdx] === 'O';

        // 보증금, 월임대료 (승강기 뒤 숫자들)
        const afterElevator = cells.slice(elevatorIdx + 1)
            .map(s => s.replace(/,/g, ''))
            .filter(s => /^\d+$/.test(s))
            .map(Number);

        if (afterElevator.length < 2) return null;

        const deposit = afterElevator[0];
        const monthlyRent = afterElevator[1];

        if (isNaN(id) || isNaN(exclusiveArea) || isNaN(rooms) || isNaN(deposit) || isNaN(monthlyRent)) {
            return null;
        }

        return {
            id,
            district,
            propertyId,
            address,
            unit: String(unit),
            exclusiveArea,
            rooms,
            elevator,
            deposit,
            monthlyRent,
            lat: null,
            lng: null,
            commuteMin: null
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
