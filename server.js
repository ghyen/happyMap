require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const IS_PROD = process.env.NODE_ENV === 'production';

// 시작 시 js/config.js 생성
function generateConfig() {
    const content = `const CONFIG = {
    KAKAO_MAP_API_KEY: "${process.env.KAKAO_MAP_API_KEY}",
    KAKAO_REST_API_KEY: "${process.env.KAKAO_REST_API_KEY}"
};

const KakaoSDK = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '//dapi.kakao.com/v2/maps/sdk.js?appkey=' + CONFIG.KAKAO_MAP_API_KEY + '&libraries=services,clusterer&autoload=false';
    script.onload = function() { kakao.maps.load(resolve); };
    script.onerror = function() { reject(new Error('카카오 지도 SDK를 불러올 수 없습니다.')); };
    document.head.appendChild(script);
});`;
    fs.writeFileSync(path.join(__dirname, 'js', 'config.js'), content);
}

// 쿠키 파싱
function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach(c => {
        const [name, ...rest] = c.trim().split('=');
        cookies[name] = rest.join('=');
    });
    return cookies;
}

// 정적 파일 서빙
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Auth 라우트 ──────────────────────────────────────────

app.get('/api/auth/kakao', (req, res) => {
    const redirectUri = `${BASE_URL}/api/auth/callback`;
    const url = `https://kauth.kakao.com/oauth/authorize` +
        `?client_id=${process.env.KAKAO_REST_API_KEY}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code`;
    res.redirect(url);
});

app.get('/api/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=no_code');

    const redirectUri = `${BASE_URL}/api/auth/callback`;

    try {
        const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: process.env.KAKAO_REST_API_KEY,
                redirect_uri: redirectUri,
                code
            })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return res.redirect('/?error=token_failed');

        const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const userData = await userRes.json();

        const user = {
            id: userData.id,
            nickname: userData.properties?.nickname || '',
            profileImage: userData.properties?.profile_image || ''
        };

        const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
        const maxAge = 7 * 24 * 60 * 60;
        const secure = IS_PROD ? 'Secure; ' : '';

        res.setHeader('Set-Cookie', `auth_token=${token}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=${maxAge}`);
        res.redirect('/');
    } catch (err) {
        console.error('Auth error:', err);
        res.redirect('/?error=auth_failed');
    }
});

app.get('/api/auth/me', (req, res) => {
    const token = parseCookies(req.headers.cookie).auth_token;
    if (!token) return res.json({ user: null });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ user: { id: decoded.id, nickname: decoded.nickname, profileImage: decoded.profileImage } });
    } catch {
        res.json({ user: null });
    }
});

app.get('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'auth_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.redirect('/');
});

// ── 시작 ────────────────────────────────────────────────

generateConfig();
app.listen(PORT, () => {
    console.log(`서버 실행 중: ${BASE_URL} (포트 ${PORT})`);
});
