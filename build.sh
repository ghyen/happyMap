#!/bin/bash
# 환경변수로 config.js 생성
cat > js/config.js << EOF
const CONFIG = {
    KAKAO_MAP_API_KEY: "${KAKAO_MAP_API_KEY}",
    KAKAO_REST_API_KEY: "${KAKAO_REST_API_KEY}"
};

const KakaoSDK = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '//dapi.kakao.com/v2/maps/sdk.js?appkey=' + CONFIG.KAKAO_MAP_API_KEY + '&libraries=services,clusterer&autoload=false';
    script.onload = function() {
        kakao.maps.load(resolve);
    };
    document.head.appendChild(script);
});
EOF
