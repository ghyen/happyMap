// 전역 에러 핸들러 — JS 에러 시 무한 로딩 방지
window.addEventListener('error', function() {
    document.getElementById('loading')?.classList.add('hidden');
});
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled:', e.reason);
    document.getElementById('loading')?.classList.add('hidden');
});

/**
 * 메인 앱 로직
 */
const App = (function() {
    let properties = [];
    let filteredProperties = [];
    let searchKeyword = '';
    let mobileView = 'list';

    /**
     * 데이터 로드
     */
    async function loadData(path) {
        try {
            const source = path || SettingsModule.getDatasetPath();

            if (source.startsWith('idb:')) {
                const name = source.slice(4);
                const data = await DatasetStore.load(name);
                if (!data) throw new Error('저장된 데이터셋을 찾을 수 없습니다.');
                properties = data;
                return properties;
            }

            const response = await fetch(source);
            if (!response.ok) {
                throw new Error('데이터를 불러올 수 없습니다.');
            }
            properties = await response.json();
            return properties;
        } catch (error) {
            console.error('데이터 로드 실패:', error);
            showToast('데이터를 불러오는데 실패했습니다.');
            return [];
        }
    }

    /**
     * 검색어 매칭 확인
     */
    function isSearchMatch(property, lowerKeyword) {
        return property.propertyId.toLowerCase().includes(lowerKeyword) ||
               property.address.toLowerCase().includes(lowerKeyword) ||
               property.district.toLowerCase().includes(lowerKeyword) ||
               String(property.unit).toLowerCase().includes(lowerKeyword);
    }

    /**
     * 지도 리사이즈 트리거 (타일 깨짐 방지)
     */
    function relayout() {
        const trigger = () => {
            const map = MapModule.getMap();
            if (map && window.kakao?.maps?.event) {
                kakao.maps.event.trigger(map, 'resize');
            }
        };
        requestAnimationFrame(() => requestAnimationFrame(trigger));
        setTimeout(trigger, 300);
    }

    /**
     * 모바일 뷰 전환
     */
    function setMobileView(view) {
        mobileView = view === 'map' ? 'map' : 'list';

        if (window.innerWidth > 768) {
            document.body.classList.remove('mobile-map-view', 'mobile-list-view');
            return;
        }

        document.body.classList.toggle('mobile-map-view', mobileView === 'map');
        document.body.classList.toggle('mobile-list-view', mobileView === 'list');

        const listBtn = document.getElementById('mobile-show-list');
        const mapBtn = document.getElementById('mobile-show-map');
        if (listBtn && mapBtn) {
            listBtn.classList.toggle('active', mobileView === 'list');
            mapBtn.classList.toggle('active', mobileView === 'map');
        }

        if (mobileView === 'map') {
            relayout();
        }
    }

    /**
     * 리스트 렌더링
     */
    function renderList(data) {
        const listEl = document.getElementById('property-list');
        const countEl = document.getElementById('result-count');

        listEl.innerHTML = '';
        countEl.textContent = `${data.length}건`;

        if (data.length === 0) {
            listEl.innerHTML = `
                <li class="no-results">
                    <p>검색 결과가 없습니다</p>
                    <small>필터 조건을 변경해보세요</small>
                </li>
            `;
            return;
        }

        data.forEach(property => {
            const li = document.createElement('li');
            li.className = 'property-item';
            li.dataset.key = `${property.id}-${property.unit}`;

            if (searchKeyword && isSearchMatch(property, searchKeyword)) {
                li.classList.add('highlight');
            }

            li.innerHTML = `
                <div class="property-header">
                    <div class="id">${property.propertyId}</div>
                    <span class="unit-badge">${property.unit}호</span>
                </div>
                <div class="address">${property.address}</div>
                <div class="info">
                    <span class="area">${property.exclusiveArea}㎡</span>
                    <span class="rooms">방${property.rooms || '?'}개</span>
                    <span class="elevator-badge ${property.elevator ? 'yes' : 'no'}">승강기 ${property.elevator ? 'O' : 'X'}</span>
                </div>
                <div class="price-info">
                    ${(() => {
                        const c = SettingsModule.getConvertedPrices(property.deposit, property.monthlyRent);
                        const changed = c.deposit !== property.deposit || c.monthlyRent !== property.monthlyRent;
                        const dep = changed
                            ? `<span class="price-converted">${MarkerModule.formatPrice(property.deposit)}</span>${MarkerModule.formatPrice(c.deposit)}`
                            : MarkerModule.formatPrice(property.deposit);
                        const rent = changed
                            ? `<span class="price-converted">${MarkerModule.formatPrice(property.monthlyRent)}</span>${MarkerModule.formatPrice(c.monthlyRent)}`
                            : MarkerModule.formatPrice(property.monthlyRent);
                        return `<span class="deposit">보증금 ${dep}만</span><span class="rent">월 ${rent}만</span>`;
                    })()}
                    ${property.commuteMin != null ? `<span class="commute">🚗 ${property.commuteMin}분</span>` : ''}
                </div>
            `;

            li.addEventListener('click', () => {
                MarkerModule.focusMarker(property.id, property.unit);

                document.querySelectorAll('.property-item.active').forEach(el => {
                    el.classList.remove('active');
                });
                li.classList.add('active');

                if (window.innerWidth <= 768) {
                    setMobileView('map');
                }
            });

            listEl.appendChild(li);
        });
    }

    /**
     * 검색 실행
     */
    function search(keyword) {
        searchKeyword = keyword.trim().toLowerCase();

        if (!searchKeyword) {
            updateView();
            return;
        }

        const results = filteredProperties.filter(p => isSearchMatch(p, searchKeyword));

        window.va?.track('search', { keyword: searchKeyword });

        if (results.length === 0) {
            showToast('검색 결과가 없습니다');
        } else {
            showToast(`${results.length}건의 검색 결과`);
            if (results[0].lat && results[0].lng) {
                MapModule.panTo(results[0].lat, results[0].lng, 5);
            }
            if (window.innerWidth <= 768) {
                setMobileView('map');
            }
        }

        renderList(results);
        MarkerModule.createMarkers(results);
    }

    /**
     * 필터 적용 후 업데이트
     */
    function updateView(fitBounds = true) {
        filteredProperties = FilterModule.applyFilters();

        const showInBounds = document.getElementById('show-in-bounds').checked;
        let displayData = filteredProperties;

        if (showInBounds) {
            displayData = filteredProperties.filter(p =>
                p.lat && p.lng && MapModule.isInBounds(p.lat, p.lng)
            );
        }

        if (searchKeyword) {
            displayData = displayData.filter(p => isSearchMatch(p, searchKeyword));
        }

        MarkerModule.createMarkers(displayData);
        renderList(displayData);

        if (fitBounds && !showInBounds) {
            const markers = MarkerModule.getMarkers();
            if (markers.length > 0) {
                MapModule.fitBounds(markers);
            }
        }
    }

    /**
     * 지도 범위 변경 시 리스트 업데이트
     */
    function onBoundsChange() {
        const showInBounds = document.getElementById('show-in-bounds').checked;
        if (showInBounds) {
            updateView(false);
        }
    }

    /**
     * 토스트 메시지 표시
     */
    function showToast(message) {
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 이벤트 바인딩
     */
    function bindEvents() {
        document.getElementById('apply-filter').addEventListener('click', () => {
            searchKeyword = '';
            document.getElementById('search-input').value = '';
            updateView();
            window.va?.track('filter_apply');
        });

        document.getElementById('reset-filter').addEventListener('click', () => {
            FilterModule.resetFilters();
            searchKeyword = '';
            document.getElementById('search-input').value = '';
            document.getElementById('show-in-bounds').checked = false;
            updateView();
        });

        document.querySelectorAll('.filter-group input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    updateView();
                }
            });
        });

        document.getElementById('toggle-filter').addEventListener('click', function() {
            const content = document.getElementById('filter-content');
            content.classList.toggle('collapsed');
            this.textContent = content.classList.contains('collapsed') ? '펼치기' : '접기';
        });

        document.getElementById('search-btn').addEventListener('click', () => {
            const keyword = document.getElementById('search-input').value;
            search(keyword);
        });

        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                search(e.target.value);
            }
        });

        document.getElementById('show-in-bounds').addEventListener('change', () => {
            updateView(false);
        });

        const mobileListBtn = document.getElementById('mobile-show-list');
        const mobileMapBtn = document.getElementById('mobile-show-map');
        const mobileSettingsBtn = document.getElementById('mobile-show-settings');
        if (mobileListBtn && mobileMapBtn) {
            mobileListBtn.addEventListener('click', () => {
                document.getElementById('settings-panel').classList.remove('mobile-open');
                setMobileView('list');
            });
            mobileMapBtn.addEventListener('click', () => {
                document.getElementById('settings-panel').classList.remove('mobile-open');
                setMobileView('map');
            });
        }
        if (mobileSettingsBtn) {
            mobileSettingsBtn.addEventListener('click', () => {
                document.getElementById('settings-panel').classList.add('mobile-open');
            });
        }

        window.addEventListener('resize', () => {
            setMobileView(mobileView);
            relayout();
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) relayout();
        });

        let boundsChangeTimeout;
        MapModule.addBoundsChangeListener(() => {
            clearTimeout(boundsChangeTimeout);
            boundsChangeTimeout = setTimeout(onBoundsChange, 200);
        });
    }

    /**
     * 로딩 표시/숨김
     */
    function showLoading(show) {
        const loadingEl = document.getElementById('loading');
        if (show) {
            loadingEl.classList.remove('hidden');
        } else {
            loadingEl.classList.add('hidden');
        }
    }

    /**
     * 앱 초기화
     */
    async function init() {
        try {
            await KakaoSDK;
            MapModule.init();

            properties = await loadData();

            if (properties.length === 0) {
                showLoading(false);
                const listEl = document.getElementById('property-list');
                listEl.innerHTML = `
                    <li class="no-results">
                        <p>데이터가 없습니다</p>
                        <small>data/properties.json 파일을 확인해주세요</small>
                    </li>
                `;
                return;
            }

            FilterModule.setProperties(properties);
            FilterModule.initDistrictFilter();
            filteredProperties = properties;

            MarkerModule.createMarkers(properties);
            renderList(properties);
            bindEvents();

            const markers = MarkerModule.getMarkers();
            if (markers.length > 0) {
                MapModule.fitBounds(markers);
            }

            SettingsModule.init(
                async (path) => {
                    showLoading(true);
                    properties = await loadData(path);
                    FilterModule.setProperties(properties);
                    filteredProperties = properties;
                    MarkerModule.createMarkers(properties);
                    renderList(properties);
                    const m = MarkerModule.getMarkers();
                    if (m.length > 0) MapModule.fitBounds(m);
                    showLoading(false);
                    showToast(`${properties.length}건 로드 완료`);
                },
                () => properties,
                () => {
                    updateView();
                    showToast('소요시간 재계산 완료');
                },
                () => {
                    updateView(false);
                }
            );

            setMobileView('list');
            showLoading(false);
        } catch (error) {
            console.error('앱 초기화 실패:', error);
            showLoading(false);

            const loadingEl = document.getElementById('loading');
            loadingEl.classList.remove('hidden');
            loadingEl.innerHTML = error.message?.includes('카카오 지도')
                ? '<p>지도를 불러올 수 없습니다.</p><small>잠시 후 새로고침 해주세요.</small>'
                : '<p>앱을 불러올 수 없습니다.</p><small>잠시 후 새로고침 해주세요.</small>';
        }
    }

    return {
        init,
        updateView,
        showToast,
        setMobileView
    };
})();

document.addEventListener('DOMContentLoaded', App.init);
