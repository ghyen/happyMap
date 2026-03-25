/**
 * 설정 패널 모듈
 * - 데이터셋 선택
 * - 회사 위치 설정 & 소요시간 재계산
 */
const SettingsModule = (function() {
    const STORAGE_KEY = 'happymap_settings';
    const API_DELAY_MS = 200;
    const COORD_PRECISION = 5;

    let conversionType = 'none';
    let conversionPercent = 0;

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

    /**
     * 보증금/월세 전환 계산
     */
    function getConvertedPrices(deposit, monthlyRent) {
        if (conversionType === 'none' || conversionPercent === 0) {
            return { deposit, monthlyRent };
        }

        if (conversionType === 'jeonse') {
            // 전세전환: 임대료↓ 보증금↑ (이율 6.7%)
            const rentDec = Math.floor(monthlyRent * conversionPercent / 100 / 10000) * 10000;
            const depInc = Math.floor(rentDec / 0.067 * 12 / 1000000) * 1000000;
            return {
                deposit: deposit + depInc,
                monthlyRent: monthlyRent - rentDec
            };
        }

        if (conversionType === 'monthly') {
            // 월세전환: 보증금↓ 임대료↑ (이율 2.5%)
            const depDec = Math.floor(deposit * conversionPercent / 100 / 1000000) * 1000000;
            const rentInc = Math.floor(depDec * 0.025 / 12 / 10000) * 10000;
            return {
                deposit: deposit - depDec,
                monthlyRent: monthlyRent + rentInc
            };
        }

        return { deposit, monthlyRent };
    }

    function initConversion(onConversionChange) {
        const settings = loadSettings();
        const typeSelect = document.getElementById('conversion-type');
        const sliderWrap = document.getElementById('conversion-slider-wrap');
        const slider = document.getElementById('conversion-percent');
        const percentLabel = document.getElementById('conversion-percent-value');
        const infoEl = document.getElementById('conversion-info');

        conversionType = settings.conversionType || 'none';
        conversionPercent = settings.conversionPercent || 0;

        typeSelect.value = conversionType;
        slider.value = conversionPercent;

        function updateSliderUI() {
            const maxPercent = conversionType === 'jeonse' ? 80 : 60;
            slider.max = maxPercent;
            if (conversionPercent > maxPercent) {
                conversionPercent = maxPercent;
                slider.value = conversionPercent;
            }
            percentLabel.textContent = conversionPercent + '%';
            sliderWrap.classList.toggle('visible', conversionType !== 'none');

            if (conversionType === 'jeonse') {
                infoEl.textContent = conversionPercent > 0
                    ? `기준 임대료의 ${conversionPercent}% → 보증금 전환 (이율 6.7%)`
                    : '';
            } else if (conversionType === 'monthly') {
                infoEl.textContent = conversionPercent > 0
                    ? `기준 보증금의 ${conversionPercent}% → 월세 전환 (이율 2.5%)`
                    : '';
            } else {
                infoEl.textContent = '';
            }
        }

        updateSliderUI();

        typeSelect.addEventListener('change', () => {
            conversionType = typeSelect.value;
            conversionPercent = 0;
            slider.value = 0;
            updateSettings({ conversionType, conversionPercent });
            updateSliderUI();
            if (onConversionChange) onConversionChange();
        });

        slider.addEventListener('input', () => {
            conversionPercent = parseInt(slider.value);
            percentLabel.textContent = conversionPercent + '%';
            updateSliderUI();
        });

        slider.addEventListener('change', () => {
            conversionPercent = parseInt(slider.value);
            updateSettings({ conversionPercent });
            updateSliderUI();
            if (onConversionChange) onConversionChange();
        });
    }

    function initToggle() {
        const panel = document.getElementById('settings-panel');
        const toggle = document.getElementById('settings-toggle');

        toggle.addEventListener('click', () => {
            if (panel.classList.contains('mobile-open')) {
                panel.classList.remove('mobile-open');
                return;
            }
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

    /**
     * 매물 배열의 고유 주소를 지오코딩
     */
    async function batchGeocode(properties, onProgress) {
        const addressMap = new Map();
        properties.forEach(p => {
            if (!addressMap.has(p.address)) {
                addressMap.set(p.address, null);
            }
        });

        const addresses = Array.from(addressMap.keys());
        let done = 0;

        for (const addr of addresses) {
            const coords = await geocode(addr);
            if (coords) addressMap.set(addr, coords);
            done++;
            if (onProgress) onProgress(done, addresses.length);
            await new Promise(r => setTimeout(r, API_DELAY_MS));
        }

        let assigned = 0;
        properties.forEach(p => {
            const coords = addressMap.get(p.address);
            if (coords) {
                p.lat = coords.lat;
                p.lng = coords.lng;
                assigned++;
            }
        });

        return { assigned, total: addresses.length, failed: addresses.filter(a => !addressMap.get(a)) };
    }

    function initPdfUpload(onDatasetChange) {
        const fileInput = document.getElementById('pdf-file');
        const dropZone = document.getElementById('pdf-drop-zone');
        const filenameEl = document.getElementById('pdf-filename');
        const nameInput = document.getElementById('dataset-name');
        const generateBtn = document.getElementById('pdf-generate-btn');
        const progressWrap = document.getElementById('pdf-progress');
        const progressFill = document.getElementById('pdf-progress-fill');
        const progressText = document.getElementById('pdf-progress-text');

        function setFile(file) {
            if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;
            // DataTransfer로 fileInput에 파일 설정
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            filenameEl.textContent = file.name;
            dropZone.classList.add('has-file');
            generateBtn.disabled = false;
            if (!nameInput.value) {
                nameInput.value = file.name.replace(/\.pdf$/i, '');
            }
        }

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => setFile(fileInput.files[0]));

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            setFile(file);
        });

        generateBtn.addEventListener('click', async () => {
            const file = fileInput.files[0];
            const name = nameInput.value.trim();
            if (!file || !name) return;

            generateBtn.disabled = true;
            progressWrap.hidden = false;

            function setProgress(text, percent) {
                progressText.textContent = text;
                progressFill.style.width = percent + '%';
            }

            try {
                // 1. PDF 파싱
                const { properties, errors } = await PdfParser.parse(file, setProgress);

                if (properties.length === 0) {
                    setProgress('테이블을 찾을 수 없습니다.', 0);
                    generateBtn.disabled = false;
                    return;
                }

                if (errors.length > 0) {
                    console.warn(`파싱 오류 ${errors.length}건:`, errors);
                }

                // 2. 지오코딩
                setProgress(`지오코딩 시작... (0/${properties.length})`, 60);
                const geocodeResult = await batchGeocode(properties, (done, total) => {
                    const pct = 60 + (done / total) * 35;
                    setProgress(`지오코딩 중... (${done}/${total} 주소)`, pct);
                });

                if (geocodeResult.failed.length > 0) {
                    console.warn('지오코딩 실패 주소:', geocodeResult.failed);
                }

                // 3. IndexedDB 저장
                setProgress('저장 중...', 97);
                await DatasetStore.save(name, properties);

                // 4. 드롭다운에 추가 & 선택
                const datasetSelect = document.getElementById('dataset-select');
                const optionValue = 'idb:' + name;

                if (!datasetSelect.querySelector(`option[value="${CSS.escape(optionValue)}"]`)) {
                    const option = document.createElement('option');
                    option.value = optionValue;
                    option.textContent = name;
                    datasetSelect.appendChild(option);
                }
                datasetSelect.value = optionValue;
                updateSettings({ dataset: optionValue });

                setProgress(`완료! ${properties.length}건 (지오코딩 ${geocodeResult.assigned}건)`, 100);

                // 데이터셋 로드
                if (onDatasetChange) onDatasetChange(optionValue);

            } catch (e) {
                console.error('데이터셋 생성 실패:', e);
                setProgress('오류: ' + e.message, 0);
            }

            generateBtn.disabled = false;
        });
    }

    async function loadSavedDatasets() {
        const datasets = await DatasetStore.list();
        const datasetSelect = document.getElementById('dataset-select');

        datasets.forEach(d => {
            const option = document.createElement('option');
            option.value = 'idb:' + d.name;
            option.textContent = `${d.name} (${d.count}건)`;
            datasetSelect.appendChild(option);
        });
    }

    function init(onDatasetChange, getProperties, onCommuteUpdated, onConversionChange) {
        initToggle();
        initTheme();
        initConversion(onConversionChange);
        initPdfUpload(onDatasetChange);
        loadSavedDatasets();

        const settings = loadSettings();

        const officeInput = document.getElementById('office-address');
        if (settings.officeAddress) {
            officeInput.value = settings.officeAddress;
        }

        const datasetSelect = document.getElementById('dataset-select');
        const datasetSubtitle = document.getElementById('dataset-subtitle');
        if (settings.dataset) {
            datasetSelect.value = settings.dataset;
        }
        datasetSubtitle.textContent = datasetSelect.selectedOptions[0]?.textContent || '';

        datasetSelect.addEventListener('change', () => {
            updateSettings({ dataset: datasetSelect.value });
            datasetSubtitle.textContent = datasetSelect.selectedOptions[0]?.textContent || '';
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
        getDatasetPath,
        getConvertedPrices
    };
})();
