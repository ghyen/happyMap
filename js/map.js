/**
 * 카카오 지도 관련 기능
 */
const MapModule = (function() {
    let map = null;
    let clusterer = null;
    let currentInfoWindow = null;

    // 서울 중심 좌표
    const SEOUL_CENTER = {
        lat: 37.5665,
        lng: 126.9780
    };

    /**
     * 지도 초기화
     */
    function init() {
        const container = document.getElementById('map');
        const options = {
            center: new kakao.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
            level: 8 // 서울 전체가 보이는 정도
        };

        map = new kakao.maps.Map(container, options);

        // 지도 컨트롤 추가
        const zoomControl = new kakao.maps.ZoomControl();
        map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

        // 클러스터러 초기화
        clusterer = new kakao.maps.MarkerClusterer({
            map: map,
            averageCenter: true,
            minLevel: 5,
            disableClickZoom: false,
            styles: [{
                width: '40px',
                height: '40px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '50%',
                color: '#fff',
                textAlign: 'center',
                lineHeight: '40px',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 2px 6px rgba(102, 126, 234, 0.4)'
            }]
        });

        // 지도 클릭 시 InfoWindow 닫기
        kakao.maps.event.addListener(map, 'click', function() {
            closeInfoWindow();
        });

        return map;
    }

    /**
     * 지도 객체 반환
     */
    function getMap() {
        return map;
    }

    /**
     * 클러스터러 객체 반환
     */
    function getClusterer() {
        return clusterer;
    }

    /**
     * 지도 중심 이동
     */
    function panTo(lat, lng, level) {
        const moveLatLng = new kakao.maps.LatLng(lat, lng);
        map.panTo(moveLatLng);
        if (level) {
            map.setLevel(level);
        }
    }

    /**
     * InfoWindow 표시
     */
    function showInfoWindow(marker, content) {
        closeInfoWindow();

        currentInfoWindow = new kakao.maps.InfoWindow({
            content: content,
            removable: true
        });

        currentInfoWindow.open(map, marker);
    }

    /**
     * InfoWindow 닫기
     */
    function closeInfoWindow() {
        if (currentInfoWindow) {
            currentInfoWindow.close();
            currentInfoWindow = null;
        }
    }

    /**
     * 지도 범위에 맞게 조정
     */
    function fitBounds(markers) {
        if (markers.length === 0) return;

        const bounds = new kakao.maps.LatLngBounds();
        markers.forEach(marker => {
            bounds.extend(marker.getPosition());
        });

        map.setBounds(bounds);
    }

    /**
     * 현재 지도 범위 가져오기
     */
    function getBounds() {
        return map.getBounds();
    }

    /**
     * 좌표가 현재 지도 범위 내에 있는지 확인
     */
    function isInBounds(lat, lng) {
        const bounds = map.getBounds();
        const position = new kakao.maps.LatLng(lat, lng);
        return bounds.contain(position);
    }

    /**
     * 지도 이벤트 리스너 추가
     */
    function addBoundsChangeListener(callback) {
        kakao.maps.event.addListener(map, 'bounds_changed', callback);
        kakao.maps.event.addListener(map, 'zoom_changed', callback);
        kakao.maps.event.addListener(map, 'dragend', callback);
    }

    return {
        init,
        getMap,
        getClusterer,
        panTo,
        showInfoWindow,
        closeInfoWindow,
        fitBounds,
        getBounds,
        isInBounds,
        addBoundsChangeListener
    };
})();
