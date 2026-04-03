require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
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

// ── SQLite 초기화 ────────────────────────────────────────

const db = new Database(path.join(__dirname, 'data', 'social.db'));
db.pragma('journal_mode = WAL');
db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset TEXT NOT NULL,
        address TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(dataset, address, user_id)
    );
    CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset TEXT NOT NULL,
        address TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        nickname TEXT NOT NULL,
        profile_image TEXT DEFAULT '',
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_likes_lookup ON likes(dataset, address);
    CREATE INDEX IF NOT EXISTS idx_comments_lookup ON comments(dataset, address);
`);

// 인증 미들웨어
function authMiddleware(req, res, next) {
    const token = parseCookies(req.headers.cookie).auth_token;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'unauthorized' });
    }
}

// 쿠키에서 유저 정보 (optional, 비로그인도 OK)
function optionalAuth(req, res, next) {
    const token = parseCookies(req.headers.cookie).auth_token;
    if (token) {
        try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch {}
    }
    next();
}

app.use(express.json());

// ── Rate Limiting ────────────────────────────────────────

// API 전체: 1분에 60회
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: 'too many requests' } });
app.use('/api/', apiLimiter);

// 쓰기 API (좋아요/댓글): 1분에 20회
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: 'too many requests' } });
app.use('/api/social/*/like', writeLimiter);
app.use('/api/social/*/comment', writeLimiter);

// 인증 API: 5분에 10회
const authLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, message: { error: 'too many requests' } });
app.use('/api/auth/kakao', authLimiter);

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

// ── Social 라우트 ────────────────────────────────────────

app.get('/api/social/:dataset/:address', optionalAuth, (req, res) => {
    const { dataset, address } = req.params;
    const likeCount = db.prepare('SELECT COUNT(*) as c FROM likes WHERE dataset=? AND address=?').get(dataset, address).c;
    const comments = db.prepare('SELECT id, user_id, nickname, profile_image, content, created_at FROM comments WHERE dataset=? AND address=? ORDER BY created_at ASC').all(dataset, address);
    let liked = null;
    if (req.user) {
        liked = !!db.prepare('SELECT 1 FROM likes WHERE dataset=? AND address=? AND user_id=?').get(dataset, address, req.user.id);
    }
    res.json({
        likeCount,
        liked,
        comments: comments.map(c => ({
            id: c.id, nickname: c.nickname, profileImage: c.profile_image,
            content: c.content, createdAt: c.created_at,
            isMine: req.user ? c.user_id === req.user.id : false
        }))
    });
});

app.post('/api/social/:dataset/:address/like', authMiddleware, (req, res) => {
    const { dataset, address } = req.params;
    const existing = db.prepare('SELECT id FROM likes WHERE dataset=? AND address=? AND user_id=?').get(dataset, address, req.user.id);
    if (existing) {
        db.prepare('DELETE FROM likes WHERE id=?').run(existing.id);
    } else {
        db.prepare('INSERT INTO likes (dataset, address, user_id) VALUES (?, ?, ?)').run(dataset, address, req.user.id);
    }
    const likeCount = db.prepare('SELECT COUNT(*) as c FROM likes WHERE dataset=? AND address=?').get(dataset, address).c;
    res.json({ liked: !existing, likeCount });
});

app.post('/api/social/:dataset/:address/comment', authMiddleware, (req, res) => {
    const { dataset, address } = req.params;
    const content = (req.body.content || '').trim();
    if (!content || content.length > 500) return res.status(400).json({ error: 'invalid content' });

    const result = db.prepare('INSERT INTO comments (dataset, address, user_id, nickname, profile_image, content) VALUES (?, ?, ?, ?, ?, ?)')
        .run(dataset, address, req.user.id, req.user.nickname, req.user.profileImage || '', content);

    const comment = db.prepare('SELECT id, nickname, profile_image, content, created_at FROM comments WHERE id=?').get(result.lastInsertRowid);
    res.json({ id: comment.id, nickname: comment.nickname, profileImage: comment.profile_image, content: comment.content, createdAt: comment.created_at });
});

app.delete('/api/social/comment/:id', authMiddleware, (req, res) => {
    const result = db.prepare('DELETE FROM comments WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
});

app.get('/api/social/:dataset/counts', (req, res) => {
    const rows = db.prepare('SELECT address, COUNT(*) as count FROM likes WHERE dataset=? GROUP BY address').all(req.params.dataset);
    const counts = {};
    rows.forEach(r => { counts[r.address] = r.count; });
    res.json(counts);
});

// ── 시작 ────────────────────────────────────────────────

generateConfig();
app.listen(PORT, () => {
    console.log(`서버 실행 중: ${BASE_URL} (포트 ${PORT})`);
});
