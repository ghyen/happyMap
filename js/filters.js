/**
 * 필터링 모듈
 */
const FilterModule = (function() {
    let allProperties = [];

    /**
     * 전체 데이터 설정
     */
    function setProperties(properties) {
        allProperties = properties;
    }

    /**
     * 자치구 목록 추출
     */
    function getDistricts() {
        const districts = [...new Set(allProperties.map(p => p.district))];
        return districts.sort();
    }

    /**
     * 자치구 필터 옵션 초기화
     */
    function initDistrictFilter() {
        const select = document.getElementById('district-filter');
        const districts = getDistricts();

        districts.forEach(district => {
            const option = document.createElement('option');
            option.value = district;
            option.textContent = district;
            select.appendChild(option);
        });
    }

    /**
     * 현재 필터 값 가져오기
     */
    function getFilterValues() {
        return {
            district: document.getElementById('district-filter').value,
            areaMin: parseFloat(document.getElementById('area-min').value) || null,
            areaMax: parseFloat(document.getElementById('area-max').value) || null,
            depositMin: parseFloat(document.getElementById('deposit-min').value) * 10000 || null,
            depositMax: parseFloat(document.getElementById('deposit-max').value) * 10000 || null,
            rentMin: parseFloat(document.getElementById('rent-min').value) * 10000 || null,
            rentMax: parseFloat(document.getElementById('rent-max').value) * 10000 || null,
            rooms: document.getElementById('rooms-filter')?.value || '',
            elevator: document.getElementById('elevator-filter')?.value || '',
            commuteMax: parseInt(document.getElementById('commute-max')?.value) || null
        };
    }

    /**
     * 필터 적용
     */
    function applyFilters() {
        const filters = getFilterValues();

        return allProperties.filter(property => {
            // 자치구 필터
            if (filters.district && property.district !== filters.district) {
                return false;
            }

            // 면적 필터
            if (filters.areaMin && property.exclusiveArea < filters.areaMin) {
                return false;
            }
            if (filters.areaMax && property.exclusiveArea > filters.areaMax) {
                return false;
            }

            // 보증금 필터
            if (filters.depositMin && property.deposit < filters.depositMin) {
                return false;
            }
            if (filters.depositMax && property.deposit > filters.depositMax) {
                return false;
            }

            // 월임대료 필터
            if (filters.rentMin && property.monthlyRent < filters.rentMin) {
                return false;
            }
            if (filters.rentMax && property.monthlyRent > filters.rentMax) {
                return false;
            }

            // 방개수 필터
            if (filters.rooms && property.rooms !== parseInt(filters.rooms)) {
                return false;
            }

            // 승강기 필터
            if (filters.elevator !== '') {
                const wantElevator = filters.elevator === 'true';
                if (property.elevator !== wantElevator) {
                    return false;
                }
            }

            // 소요시간 필터
            if (filters.commuteMax && property.commuteMin > filters.commuteMax) {
                return false;
            }

            return true;
        });
    }

    /**
     * 필터 초기화
     */
    function resetFilters() {
        document.getElementById('district-filter').value = '';
        document.getElementById('area-min').value = '';
        document.getElementById('area-max').value = '';
        document.getElementById('deposit-min').value = '';
        document.getElementById('deposit-max').value = '';
        document.getElementById('rent-min').value = '';
        document.getElementById('rent-max').value = '';

        const roomsFilter = document.getElementById('rooms-filter');
        if (roomsFilter) roomsFilter.value = '';

        const elevatorFilter = document.getElementById('elevator-filter');
        if (elevatorFilter) elevatorFilter.value = '';

        const commuteMax = document.getElementById('commute-max');
        if (commuteMax) commuteMax.value = '';
    }

    return {
        setProperties,
        getDistricts,
        initDistrictFilter,
        getFilterValues,
        applyFilters,
        resetFilters
    };
})();
