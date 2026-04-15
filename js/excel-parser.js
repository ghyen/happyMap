/**
 * Excel 파싱 모듈
 * 구조화된 Excel(LH 공고문 양식)을 헤더 기반으로 직접 파싱
 */
const ExcelParser = (function() {

    async function loadSheetJS() {
        if (window.XLSX) return window.XLSX;
        return new Promise((resolve, reject) => {
            if (window.XLSX) return resolve(window.XLSX);
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            script.onload = () => resolve(window.XLSX);
            script.onerror = () => reject(new Error('SheetJS 로드 실패'));
            document.head.appendChild(script);
        });
    }

    function normalizeHeader(v) {
        return String(v == null ? '' : v).replace(/\s+/g, '').trim();
    }

    function findHeaderRow(rows) {
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i] || [];
            if (row.some(c => normalizeHeader(c) === '주소')) return i;
        }
        return -1;
    }

    /**
     * 가격 컬럼 선택: 가능하면 "임대료→보증금 최대전환시" 그룹을 우선,
     * 없으면 첫 번째 임대보증금/월임대료 컬럼 사용
     */
    function pickPriceCols(rows, headerIdx) {
        const header = (rows[headerIdx] || []).map(normalizeHeader);
        const depositIdxs = [];
        const rentIdxs = [];
        header.forEach((h, i) => {
            if (h === '임대보증금') depositIdxs.push(i);
            if (h === '월임대료') rentIdxs.push(i);
        });

        // 헤더 바로 위 두 줄에서 '전환' 그룹 라벨 탐색 (병합셀 → 첫 컬럼에만 라벨)
        for (let r = headerIdx - 1; r >= Math.max(0, headerIdx - 2); r--) {
            const groupRow = (rows[r] || []).map(normalizeHeader);
            const convertedIdx = groupRow.findIndex(v => v && v.includes('전환'));
            if (convertedIdx >= 0) {
                const depositAt = depositIdxs.find(i => i >= convertedIdx);
                const rentAt = rentIdxs.find(i => i >= convertedIdx);
                if (depositAt != null && rentAt != null) {
                    return { deposit: depositAt, rent: rentAt };
                }
            }
        }

        return {
            deposit: depositIdxs[0] ?? -1,
            rent: rentIdxs[0] ?? -1
        };
    }

    function buildColumnMap(rows, headerIdx) {
        const headerRow = rows[headerIdx] || [];
        const normalized = headerRow.map(normalizeHeader);
        function find(...names) {
            for (const name of names) {
                const idx = normalized.indexOf(name);
                if (idx >= 0) return idx;
            }
            return -1;
        }
        const price = pickPriceCols(rows, headerIdx);
        return {
            address: find('주소'),
            unit: find('호'),
            buildingName: find('주택군이름', '주택군명', '단지명'),
            area: find('전용면적'),
            rooms: find('방수'),
            elevator: find('승강기유무'),
            deposit: price.deposit,
            rent: price.rent
        };
    }

    function parseNumber(v) {
        if (v == null || v === '') return NaN;
        return parseInt(String(v).replace(/[,\s]/g, ''));
    }

    function extractDistrict(address) {
        const parts = String(address).split(/\s+/).slice(1);
        for (const p of parts) {
            if (/^[가-힣]{1,5}[구군]$/.test(p)) return p;
        }
        return '';
    }

    function parseSheet(rows) {
        const headerIdx = findHeaderRow(rows);
        if (headerIdx < 0) return [];

        const cols = buildColumnMap(rows, headerIdx);
        if (cols.address < 0 || cols.deposit < 0 || cols.rent < 0 || cols.area < 0) {
            return [];
        }

        const properties = [];

        for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i] || [];
            const address = String(row[cols.address] || '').trim();
            if (!address || !/[구군시]/.test(address)) continue;

            const deposit = parseNumber(row[cols.deposit]);
            const rent = parseNumber(row[cols.rent]);
            const area = parseFloat(row[cols.area]);
            if (isNaN(deposit) || isNaN(rent) || isNaN(area)) continue;

            const unit = String(row[cols.unit] == null ? '' : row[cols.unit]).trim();
            const rooms = parseInt(row[cols.rooms]) || null;
            const elevStr = String(row[cols.elevator] == null ? '' : row[cols.elevator]).trim();
            const elevator = elevStr === 'Y' || elevStr === 'O';
            const propertyId = cols.buildingName >= 0
                ? String(row[cols.buildingName] || '').trim()
                : '';

            properties.push({
                district: extractDistrict(address),
                propertyId,
                address,
                unit,
                exclusiveArea: area,
                rooms,
                elevator,
                deposit,
                monthlyRent: rent,
                lat: null,
                lng: null,
                commuteMin: null
            });
        }

        return properties;
    }

    /**
     * 전체 파이프라인: Excel File → properties 배열 (구조적 파싱)
     */
    async function parse(file, onProgress) {
        if (onProgress) onProgress('Excel 읽는 중...', 10);

        const XLSX = await loadSheetJS();
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        if (onProgress) onProgress('데이터 추출 중...', 30);

        const allProps = [];
        workbook.SheetNames.forEach(name => {
            const sheet = workbook.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            const props = parseSheet(rows);
            allProps.push(...props);
        });

        if (allProps.length === 0) {
            throw new Error('매물 데이터를 찾을 수 없습니다. (주소/전용면적/임대보증금/월임대료 컬럼 필요)');
        }

        allProps.forEach((p, i) => p.id = i + 1);

        if (onProgress) onProgress(`파싱 완료: ${allProps.length}건`, 60);

        return { properties: allProps, errors: [] };
    }

    return { parse };
})();
