/**
 * 메인 앱 로직
 */
const App = (function() {
    let properties = [];
    let filteredProperties = [];
    let searchKeyword = '';

    /**
     * 데이터 로드
     */
    async function loadData() {
        try {
            const response = await fetch('data/properties.json');
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

            // 검색어 하이라이트
            if (searchKeyword && isSearchMatch(property, searchKeyword)) {
                li.classList.add('highlight');
            }

            // 성별 표시
            const genderBadge = property.gender ?
                `<span class="gender-badge ${property.gender === '남성' ? 'male' : 'female'}">${property.gender}</span>` : '';

            li.innerHTML = `
                <div class="property-header">
                    <div class="id">${property.propertyId}</div>
                    <span class="unit-badge">${property.unit}호</span>
                    ${genderBadge}
                </div>
                <div class="address">${property.address}</div>
                <div class="info">
                    <span class="area">${property.exclusiveArea}㎡</span>
                    <span class="structure">${property.structure || ''}</span>
                </div>
                <div class="price-info">
                    <span class="deposit">보증금 ${MarkerModule.formatPrice(property.deposit)}만</span>
                    <span class="rent">월 ${MarkerModule.formatPrice(property.monthlyRent)}만</span>
                </div>
            `;

            // 리스트 아이템 클릭 이벤트
            li.addEventListener('click', () => {
                MarkerModule.focusMarker(property.id, property.unit);

                // active 상태 변경
                document.querySelectorAll('.property-item.active').forEach(el => {
                    el.classList.remove('active');
                });
                li.classList.add('active');
            });

            listEl.appendChild(li);
        });
    }

    /**
     * 검색어 매칭 확인
     */
    function isSearchMatch(property, keyword) {
        const lowerKeyword = keyword.toLowerCase();
        return property.propertyId.toLowerCase().includes(lowerKeyword) ||
               property.address.toLowerCase().includes(lowerKeyword) ||
               property.district.toLowerCase().includes(lowerKeyword) ||
               property.unit.toLowerCase().includes(lowerKeyword);
    }

    /**
     * 검색 실행
     */
    function search(keyword) {
        searchKeyword = keyword.trim();

        if (!searchKeyword) {
            updateView();
            return;
        }

        const results = filteredProperties.filter(p => isSearchMatch(p, searchKeyword));

        if (results.length === 0) {
            showToast('검색 결과가 없습니다');
        } else {
            showToast(`${results.length}건의 검색 결과`);
            // 첫 번째 결과로 이동
            if (results[0].lat && results[0].lng) {
                MapModule.panTo(results[0].lat, results[0].lng, 5);
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

        // 지도 범위 필터 적용
        const showInBounds = document.getElementById('show-in-bounds').checked;
        let displayData = filteredProperties;

        if (showInBounds) {
            displayData = filteredProperties.filter(p =>
                p.lat && p.lng && MapModule.isInBounds(p.lat, p.lng)
            );
        }

        // 검색어가 있으면 추가 필터링
        if (searchKeyword) {
            displayData = displayData.filter(p => isSearchMatch(p, searchKeyword));
        }

        MarkerModule.createMarkers(displayData);
        renderList(displayData);

        // 필터된 마커가 있으면 범위 조정
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
        // 기존 토스트 제거
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // 표시
        setTimeout(() => toast.classList.add('show'), 10);

        // 3초 후 제거
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 이벤트 바인딩
     */
    function bindEvents() {
        // 필터 적용 버튼
        document.getElementById('apply-filter').addEventListener('click', () => {
            searchKeyword = '';
            document.getElementById('search-input').value = '';
            updateView();
        });

        // 필터 초기화 버튼
        document.getElementById('reset-filter').addEventListener('click', () => {
            FilterModule.resetFilters();
            searchKeyword = '';
            document.getElementById('search-input').value = '';
            document.getElementById('show-in-bounds').checked = false;
            updateView();
        });

        // Enter 키로 필터 적용
        document.querySelectorAll('.filter-group input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    updateView();
                }
            });
        });

        // 필터 접기/펼치기
        document.getElementById('toggle-filter').addEventListener('click', function() {
            const content = document.getElementById('filter-content');
            content.classList.toggle('collapsed');
            this.textContent = content.classList.contains('collapsed') ? '펼치기' : '접기';
        });

        // 검색
        document.getElementById('search-btn').addEventListener('click', () => {
            const keyword = document.getElementById('search-input').value;
            search(keyword);
        });

        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                search(e.target.value);
            }
        });

        // 지도 영역만 보기 체크박스
        document.getElementById('show-in-bounds').addEventListener('change', () => {
            updateView(false);
        });

        // 지도 범위 변경 이벤트 (디바운스 적용)
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
            // Kakao SDK 로드 대기 후 지도 초기화
            await KakaoSDK;
            MapModule.init();

            // 데이터 로드
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

            // 필터 모듈에 데이터 설정
            FilterModule.setProperties(properties);
            FilterModule.initDistrictFilter();
            FilterModule.initStructureFilter();
            FilterModule.initGenderFilter();
            filteredProperties = properties;

            // 마커 생성 및 리스트 렌더링
            MarkerModule.createMarkers(properties);
            renderList(properties);

            // 이벤트 바인딩
            bindEvents();

            // 모든 마커가 보이도록 범위 조정
            const markers = MarkerModule.getMarkers();
            if (markers.length > 0) {
                MapModule.fitBounds(markers);
            }

            // 로딩 숨김
            showLoading(false);

        } catch (error) {
            console.error('앱 초기화 실패:', error);
            showLoading(false);
            showToast('앱 초기화에 실패했습니다');
        }
    }

    return {
        init,
        updateView,
        showToast
    };
})();

// DOM 로드 후 앱 실행
document.addEventListener('DOMContentLoaded', App.init);
