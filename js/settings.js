/**
 * 설정 패널 모듈
 * - 데이터셋 선택
 * - 회사 위치 설정 & 소요시간 재계산
 */
const SettingsModule = (function() {
    const STORAGE_KEY = 'happymap_settings';
    const API_DELAY_MS = 200;
    const COORD_PRECISION = 5;

    function loadSettings() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    }

    function saveSettings(settings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    function updateSettings(updates) {
        const s = loadSettings();
        Object.assign(s, updates);
        saveSettings(s);
    }

    function kakaoFetch(url) {
        return fetch(url, {
            headers: { 'Authorization': `KakaoAK ${CONFIG.KAKAO_REST_API_KEY}` }
        }).then(r => r.json());
    }

    function coordKey(lat, lng) {
        return `${lat.toFixed(COORD_PRECISION)},${lng.toFixed(COORD_PRECISION)}`;
    }

    /**
     * Kakao Local API로 주소 → 좌표 변환
     */
    async function geocode(address) {
        const q = encodeURIComponent(address);
        const data = await kakaoFetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${q}`);
        if (data.documents?.length > 0) {
            const doc = data.documents[0];
            const ra = doc.road_address;
            if (ra) return { lat: parseFloat(ra.y), lng: parseFloat(ra.x) };
            return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
        }
        // 키워드 검색 fallback
        const data2 = await kakaoFetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}`);
        if (data2.documents?.length > 0) {
            const doc = data2.documents[0];
            return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
        }
        return null;
    }

    /**
     * Kakao Navi API로 자동차 소요시간 계산
     */
    async function getDriveTime(originLng, originLat, destLng, destLat) {
        try {
            const data = await kakaoFetch(
                `https://apis-navi.kakaomobility.com/v1/directions?origin=${originLng},${originLat}&destination=${destLng},${destLat}&priority=RECOMMEND`
            );
            const routes = data.routes || [];
            if (routes.length > 0 && routes[0].result_code === 0) {
                return Math.floor(routes[0].summary.duration / 60);
            }
        } catch (e) {
            console.warn('경로 계산 실패:', e);
        }
        return null;
    }

    /**
     * 전체 매물의 소요시간 재계산 (고유 좌표 기준)
     */
    async function recalculateCommute(properties, officeLat, officeLng, onProgress) {
        const coordMap = new Map();
        properties.forEach(p => {
            if (p.lat && p.lng) {
                const key = coordKey(p.lat, p.lng);
                if (!coordMap.has(key)) {
                    coordMap.set(key, { lat: p.lat, lng: p.lng });
                }
            }
        });

        const coords = Array.from(coordMap.entries());
        const results = new Map();
        let done = 0;

        for (const [key, { lat, lng }] of coords) {
            const minutes = await getDriveTime(lng, lat, officeLng, officeLat);
            results.set(key, minutes);
            done++;
            if (onProgress) onProgress(done, coords.length);
            await new Promise(r => setTimeout(r, API_DELAY_MS));
        }

        let assigned = 0;
        properties.forEach(p => {
            if (p.lat && p.lng) {
                const min = results.get(coordKey(p.lat, p.lng));
                if (min != null) {
                    p.commuteMin = min;
                    assigned++;
                }
            }
        });

        return assigned;
    }

    function initToggle() {
        const panel = document.getElementById('settings-panel');
        const toggle = document.getElementById('settings-toggle');

        toggle.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggle.textContent = panel.classList.contains('collapsed') ? '⚙' : '✕';
        });
    }

    function initTheme() {
        const settings = loadSettings();
        const btn = document.getElementById('theme-toggle');
        const isDark = settings.theme === 'dark' ||
            (settings.theme == null && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (isDark) document.body.classList.add('dark');
        btn.textContent = isDark ? '라이트모드' : '다크모드';

        btn.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            const dark = document.body.classList.contains('dark');
            btn.textContent = dark ? '라이트모드' : '다크모드';
            updateSettings({ theme: dark ? 'dark' : 'light' });
        });
    }

    function init(onDatasetChange, getProperties, onCommuteUpdated) {
        initToggle();
        initTheme();

        const settings = loadSettings();

        const officeInput = document.getElementById('office-address');
        if (settings.officeAddress) {
            officeInput.value = settings.officeAddress;
        }

        const datasetSelect = document.getElementById('dataset-select');
        const datasetNameEl = document.getElementById('dataset-name');
        if (settings.dataset) {
            datasetSelect.value = settings.dataset;
        }
        datasetNameEl.textContent = datasetSelect.selectedOptions[0]?.textContent || '';

        datasetSelect.addEventListener('change', () => {
            updateSettings({ dataset: datasetSelect.value });
            datasetNameEl.textContent = datasetSelect.selectedOptions[0]?.textContent || '';
            if (onDatasetChange) onDatasetChange(datasetSelect.value);
        });

        document.getElementById('save-office').addEventListener('click', async () => {
            const address = officeInput.value.trim();
            if (!address) return;

            const statusEl = document.getElementById('office-status');
            statusEl.textContent = '주소 검색 중...';

            const coords = await geocode(address);
            if (!coords) {
                statusEl.textContent = '주소를 찾을 수 없습니다.';
                return;
            }

            updateSettings({
                officeAddress: address,
                officeLat: coords.lat,
                officeLng: coords.lng
            });

            statusEl.textContent = '소요시간 계산 중...';

            const properties = getProperties();
            const assigned = await recalculateCommute(
                properties,
                coords.lat, coords.lng,
                (done, total) => {
                    statusEl.textContent = `소요시간 계산 중... (${done}/${total})`;
                }
            );

            statusEl.textContent = `완료! ${assigned}개 매물 업데이트`;
            if (onCommuteUpdated) onCommuteUpdated();

            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        });
    }

    function getDatasetPath() {
        return loadSettings().dataset || 'data/properties.json';
    }

    return {
        init,
        getDatasetPath
    };
})();
