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
     * 주택구조 목록 추출
     */
    function getStructures() {
        const structures = [...new Set(allProperties.map(p => p.structure).filter(Boolean))];
        return structures.sort();
    }

    /**
     * 성별 목록 추출
     */
    function getGenders() {
        const genders = [...new Set(allProperties.map(p => p.gender).filter(Boolean))];
        return genders.sort();
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
     * 주택구조 필터 옵션 초기화
     */
    function initStructureFilter() {
        const select = document.getElementById('structure-filter');
        if (!select) return;

        const structures = getStructures();

        structures.forEach(structure => {
            const option = document.createElement('option');
            option.value = structure;
            option.textContent = structure;
            select.appendChild(option);
        });
    }

    /**
     * 성별 필터 옵션 초기화
     */
    function initGenderFilter() {
        const select = document.getElementById('gender-filter');
        if (!select) return;

        // 이미 HTML에 옵션이 있으므로 추가 초기화 불필요
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
            structure: document.getElementById('structure-filter')?.value || '',
            gender: document.getElementById('gender-filter')?.value || '',
            supplyType: document.getElementById('supply-type-filter')?.value || ''
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

            // 주택구조 필터
            if (filters.structure && property.structure !== filters.structure) {
                return false;
            }

            // 성별 필터
            if (filters.gender) {
                if (filters.gender === '무관') {
                    // 성별 제한이 없는 매물만 표시
                    if (property.gender && property.gender !== '') {
                        return false;
                    }
                } else {
                    // 특정 성별 또는 성별 무관인 매물
                    if (property.gender && property.gender !== filters.gender) {
                        return false;
                    }
                }
            }

            // 공급유형 필터
            if (filters.supplyType && property.supplyType !== filters.supplyType) {
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

        const structureFilter = document.getElementById('structure-filter');
        if (structureFilter) structureFilter.value = '';

        const genderFilter = document.getElementById('gender-filter');
        if (genderFilter) genderFilter.value = '';

        const supplyTypeFilter = document.getElementById('supply-type-filter');
        if (supplyTypeFilter) supplyTypeFilter.value = '';
    }

    return {
        setProperties,
        getDistricts,
        getStructures,
        getGenders,
        initDistrictFilter,
        initStructureFilter,
        initGenderFilter,
        getFilterValues,
        applyFilters,
        resetFilters
    };
})();
