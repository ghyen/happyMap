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
     * 페이지 데이터를 텍스트로 변환
     */
    function pagesToText(pages) {
        return pages.map(page =>
            page.rows.map(row => row.join(' | ')).join('\n')
        ).join('\n\n--- 페이지 구분 ---\n\n');
    }

    /**
     * 전체 파이프라인: PDF File → properties 배열 (LLM 사용)
     */
    async function parse(file, onProgress) {
        if (onProgress) onProgress('PDF 텍스트 추출 중...', 0);

        const pages = await extractText(file, (done, total) => {
            if (onProgress) onProgress(`텍스트 추출 중... (${done}/${total} 페이지)`, done / total * 30);
        });

        if (onProgress) onProgress('LLM 분석 중... (시간이 걸릴 수 있습니다)', 30);

        const text = pagesToText(pages);
        const res = await fetch('/api/parse-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'LLM 파싱 실패');
        }

        const data = await res.json();

        if (data.properties.length === 0 && data._debug) {
            console.warn('LLM 응답 (파싱 실패):', data._debug);
        }

        if (onProgress) onProgress(`파싱 완료: ${data.properties.length}건`, 60);

        return { properties: data.properties, errors: [] };
    }

    return { parse };
})();
