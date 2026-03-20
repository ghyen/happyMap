const fs = require('fs');

const KAKAO_MAP_API_KEY = process.env.KAKAO_MAP_API_KEY || '';
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';

if (!KAKAO_MAP_API_KEY || !KAKAO_REST_API_KEY) {
    console.warn('Warning: KAKAO API keys not set. Check environment variables.');
}

const config = `const CONFIG = {
    KAKAO_MAP_API_KEY: "${KAKAO_MAP_API_KEY}",
    KAKAO_REST_API_KEY: "${KAKAO_REST_API_KEY}"
};

// Kakao Maps SDK 동적 로드
const KakaoSDK = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '//dapi.kakao.com/v2/maps/sdk.js?appkey=' + CONFIG.KAKAO_MAP_API_KEY + '&libraries=services,clusterer&autoload=false';
    script.onload = function() {
        kakao.maps.load(resolve);
    };
    document.head.appendChild(script);
});
`;

fs.writeFileSync('js/config.js', config);
console.log('js/config.js generated.');
