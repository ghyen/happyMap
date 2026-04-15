/**
 * Excel 파싱 모듈
 * .xlsx/.xls 파일에서 텍스트를 추출하여 LLM 파이프라인으로 전달
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

    /**
     * Excel 파일 → 시트별 텍스트 (행을 | 로 구분)
     */
    async function extractText(file, onProgress) {
        const XLSX = await loadSheetJS();
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        const parts = [];
        workbook.SheetNames.forEach((name, i) => {
            const sheet = workbook.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            const text = rows
                .map(row => row.map(cell => String(cell).trim()).join(' | '))
                .filter(line => line.replace(/\|/g, '').trim())
                .join('\n');
            if (text) parts.push(text);
            if (onProgress) onProgress(i + 1, workbook.SheetNames.length);
        });

        return parts.join('\n\n--- 시트 구분 ---\n\n');
    }

    /**
     * 전체 파이프라인: Excel File → properties 배열 (LLM 사용)
     */
    async function parse(file, onProgress) {
        if (onProgress) onProgress('Excel 텍스트 추출 중...', 0);

        const text = await extractText(file, (done, total) => {
            if (onProgress) onProgress(`시트 추출 중... (${done}/${total})`, done / total * 30);
        });

        if (!text.trim()) {
            return { properties: [], errors: [] };
        }

        if (onProgress) onProgress('LLM 분석 중... (시간이 걸릴 수 있습니다)', 30);

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
