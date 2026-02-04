/**
 * 마커 관리 모듈
 * 동일 주소의 모든 호수를 하나의 마커로 표시
 */
const MarkerModule = (function() {
    let markers = [];
    let markerMap = new Map(); // address -> marker 매핑
    let addressPropertiesMap = new Map(); // address -> properties[] 매핑

    /**
     * 금액 포맷팅 (원 -> 만원)
     */
    function formatPrice(price) {
        const man = Math.floor(price / 10000);
        return man.toLocaleString();
    }

    /**
     * 주소별로 매물 그룹화
     */
    function groupByAddress(properties) {
        const groups = new Map();

        properties.forEach(property => {
            const key = property.address;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(property);
        });

        return groups;
    }

    /**
     * 단일 호수 InfoWindow 컨텐츠
     */
    function createSingleUnitContent(property) {
        return `
            <div class="unit-item" data-id="${property.id}" data-unit="${property.unit}">
                <div class="unit-header">
                    <span class="unit-number">${property.unit}호</span>
                    <span class="unit-type">${property.structure || ''}</span>
                    ${property.gender ? `<span class="unit-gender">${property.gender}</span>` : ''}
                </div>
                <div class="unit-details">
                    <span>${property.exclusiveArea}㎡</span>
                    <span>보증금 ${formatPrice(property.deposit)}만</span>
                    <span>월 ${formatPrice(property.monthlyRent)}만</span>
                </div>
            </div>
        `;
    }

    /**
     * 다중 호수 InfoWindow 컨텐츠 생성
     */
    function createMultiUnitInfoWindowContent(address, properties) {
        const firstProp = properties[0];
        const sortedProps = [...properties].sort((a, b) => {
            // 호수 번호로 정렬
            return a.unit.localeCompare(b.unit);
        });

        const unitsHtml = sortedProps.map(p => createSingleUnitContent(p)).join('');

        return `
            <div class="info-window multi-unit">
                <div class="info-header">
                    <div class="title">${firstProp.propertyId}</div>
                    <div class="address">${address}</div>
                    <div class="unit-count">${properties.length}개 호실</div>
                </div>
                <div class="units-container">
                    ${unitsHtml}
                </div>
            </div>
        `;
    }

    /**
     * 마커 생성 (주소당 하나)
     */
    function createMarker(address, properties) {
        const firstProp = properties[0];

        if (!firstProp.lat || !firstProp.lng) {
            console.warn(`좌표 없음: ${address}`);
            return null;
        }

        const position = new kakao.maps.LatLng(firstProp.lat, firstProp.lng);

        const marker = new kakao.maps.Marker({
            position: position,
            title: `${firstProp.propertyId} (${properties.length}호실)`
        });

        // 마커 클릭 이벤트
        kakao.maps.event.addListener(marker, 'click', function() {
            const content = createMultiUnitInfoWindowContent(address, properties);
            MapModule.showInfoWindow(marker, content);

            // 첫 번째 호실 리스트 아이템 활성화
            highlightListItem(firstProp.id, firstProp.unit);
        });

        // 프로퍼티 정보 저장
        marker.address = address;
        marker.properties = properties;

        return marker;
    }

    /**
     * 모든 마커 생성 및 클러스터러에 추가
     */
    function createMarkers(properties) {
        clearMarkers();

        // 주소별로 그룹화
        const addressGroups = groupByAddress(properties);
        addressPropertiesMap = addressGroups;

        addressGroups.forEach((props, address) => {
            const marker = createMarker(address, props);
            if (marker) {
                markers.push(marker);
                markerMap.set(address, marker);
            }
        });

        // 클러스터러에 마커 추가
        const clusterer = MapModule.getClusterer();
        if (clusterer) {
            clusterer.addMarkers(markers);
        }

        return markers;
    }

    /**
     * 마커 초기화
     */
    function clearMarkers() {
        const clusterer = MapModule.getClusterer();
        if (clusterer) {
            clusterer.clear();
        }

        markers.forEach(marker => {
            marker.setMap(null);
        });

        markers = [];
        markerMap.clear();
        addressPropertiesMap.clear();
    }

    /**
     * 특정 마커로 이동 (주소 기반)
     */
    function focusMarker(id, unit) {
        // 해당 id의 주소 찾기
        let targetAddress = null;
        let targetProperty = null;

        addressPropertiesMap.forEach((props, address) => {
            const found = props.find(p => p.id === id && p.unit === unit);
            if (found) {
                targetAddress = address;
                targetProperty = found;
            }
        });

        if (targetAddress && markerMap.has(targetAddress)) {
            const marker = markerMap.get(targetAddress);
            const position = marker.getPosition();
            MapModule.panTo(position.getLat(), position.getLng(), 3);

            // 해당 주소의 모든 호실 표시
            const properties = addressPropertiesMap.get(targetAddress);
            const content = createMultiUnitInfoWindowContent(targetAddress, properties);
            MapModule.showInfoWindow(marker, content);
        }
    }

    /**
     * 주소로 마커 찾기
     */
    function focusMarkerByAddress(address) {
        if (markerMap.has(address)) {
            const marker = markerMap.get(address);
            const position = marker.getPosition();
            MapModule.panTo(position.getLat(), position.getLng(), 3);

            const properties = addressPropertiesMap.get(address);
            const content = createMultiUnitInfoWindowContent(address, properties);
            MapModule.showInfoWindow(marker, content);
        }
    }

    /**
     * 리스트 아이템 하이라이트
     */
    function highlightListItem(id, unit) {
        // 기존 active 제거
        document.querySelectorAll('.property-item.active').forEach(el => {
            el.classList.remove('active');
        });

        // 해당 아이템 active
        const key = `${id}-${unit}`;
        const item = document.querySelector(`.property-item[data-key="${key}"]`);
        if (item) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * 현재 마커 배열 반환
     */
    function getMarkers() {
        return markers;
    }

    /**
     * 주소별 매물 맵 반환
     */
    function getAddressPropertiesMap() {
        return addressPropertiesMap;
    }

    return {
        createMarkers,
        clearMarkers,
        focusMarker,
        focusMarkerByAddress,
        highlightListItem,
        getMarkers,
        getAddressPropertiesMap,
        formatPrice
    };
})();
