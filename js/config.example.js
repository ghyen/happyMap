const CONFIG = {
    KAKAO_MAP_API_KEY: "YOUR_KAKAO_MAP_API_KEY_HERE"
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
