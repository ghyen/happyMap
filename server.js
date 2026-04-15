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
    CREATE TABLE IF NOT EXISTS commute_cache (
        origin_key TEXT NOT NULL,
        dest_key TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (origin_key, dest_key)
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

app.use(express.json({ limit: '10mb' }));

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

// ── PDF 파싱 (Ollama LLM 정제 → JS 데이터 생성) ──────────

const PDF_SYSTEM_PROMPT = `너는 데이터 추출 도구다. 설명, 분석, 요약을 절대 하지 마라. 오직 아래 형식의 데이터 행만 출력하라.

입력 텍스트는 공공임대주택 공고문 PDF에서 추출된 것이다. 매물 데이터 행을 찾아서 아래 형식으로 변환하라.

출력 형식 (정확히 9개 필드, | 구분, 한 줄에 하나):
자치구|단지번호|주소|호수|전용면적|방개수|승강기|임대보증금|월임대료

규칙:
- 주소는 "서울특별시"로 시작하도록 보완
- 전용면적은 소수점 포함 숫자 (예: 25.39)
- 방개수는 숫자, 모르면 0
- 승강기는 O 또는 X, 모르면 X
- 임대보증금과 월임대료는 콤마 제거한 숫자 (예: 67810000)
- 원본 숫자를 그대로 쓰고 절대 추측하지 마라

예시 출력:
강남구|강남01|서울특별시 강남구 역삼동 123-4|303|25.39|1|O|67810000|61600

중요: 데이터 행만 출력하라. 다른 텍스트는 절대 출력하지 마라.`;

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';

function stripLlmWrapper(text) {
    // thinking 토큰 제거 (<think>...</think>, <start_of_thought>...</end_of_thought> 등)
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    text = text.replace(/<start_of_thought>[\s\S]*?<end_of_thought>/gi, '');
    // 마크다운 코드블록 안의 내용만 추출
    const codeBlockMatch = text.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlockMatch) text = codeBlockMatch[1];
    return text.trim();
}

function parseCleanedRows(text) {
    text = stripLlmWrapper(text);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const properties = [];

    for (const line of lines) {
        const parts = line.split('|').map(s => s.trim());
        if (parts.length < 9) continue;

        const [district, propertyId, address, unit, area, rooms, elevator, deposit, rent] = parts;

        const exclusiveArea = parseFloat(area);
        const depositNum = parseInt(deposit.replace(/[,\s]/g, ''));
        const rentNum = parseInt(rent.replace(/[,\s]/g, ''));

        if (!address || isNaN(exclusiveArea) || isNaN(depositNum) || isNaN(rentNum)) continue;

        properties.push({
            id: properties.length + 1,
            district: district || '',
            propertyId: propertyId || '',
            address,
            unit: String(unit),
            exclusiveArea,
            rooms: parseInt(rooms) || null,
            elevator: elevator === 'O',
            deposit: depositNum,
            monthlyRent: rentNum,
            lat: null, lng: null, commuteMin: null
        });
    }

    return properties;
}

app.post('/api/parse-pdf', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'no text' });

    try {
        const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: [
                    { role: 'system', content: PDF_SYSTEM_PROMPT },
                    { role: 'user', content: text }
                ],
                stream: false,
                think: false,
                options: { temperature: 0, num_predict: 16384 }
            })
        });

        if (!ollamaRes.ok) {
            return res.status(502).json({ error: 'LLM 요청 실패' });
        }

        const data = await ollamaRes.json();
        const cleanedText = data.message.content;
        console.log('[parse-pdf] LLM raw output (first 500 chars):', cleanedText.substring(0, 500));
        const properties = parseCleanedRows(cleanedText);

        if (properties.length === 0) {
            console.warn('[parse-pdf] 파싱 결과 0건. LLM 전체 응답:', cleanedText);
        } else {
            console.log(`[parse-pdf] 파싱 완료: ${properties.length}건`);
        }

        res.json({ properties, _debug: properties.length === 0 ? cleanedText.substring(0, 200) : undefined });
    } catch (err) {
        console.error('PDF parse error:', err);
        res.status(500).json({ error: 'LLM 파싱 실패: ' + err.message });
    }
});

// ── 소요시간 캐시 ──────────────────────────────────────

function coordKey(lat, lng) {
    return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

app.post('/api/commute/lookup', (req, res) => {
    const { dest, origins } = req.body;
    if (!dest || !Array.isArray(origins)) {
        return res.status(400).json({ error: 'dest and origins required' });
    }
    const destKey = coordKey(dest.lat, dest.lng);
    const stmt = db.prepare('SELECT minutes FROM commute_cache WHERE origin_key=? AND dest_key=?');

    const cached = [];
    const missing = [];
    for (const o of origins) {
        if (o?.lat == null || o?.lng == null) continue;
        const row = stmt.get(coordKey(o.lat, o.lng), destKey);
        if (row) cached.push({ lat: o.lat, lng: o.lng, minutes: row.minutes });
        else missing.push({ lat: o.lat, lng: o.lng });
    }
    res.json({ cached, missing });
});

app.post('/api/commute/cache', (req, res) => {
    const { dest, origin, minutes } = req.body;
    if (!dest || !origin || typeof minutes !== 'number') {
        return res.status(400).json({ error: 'dest, origin, minutes required' });
    }
    db.prepare('INSERT OR REPLACE INTO commute_cache (origin_key, dest_key, minutes) VALUES (?, ?, ?)')
        .run(coordKey(origin.lat, origin.lng), coordKey(dest.lat, dest.lng), minutes);
    res.json({ ok: true });
});

// ── 데이터셋 저장/목록 ──────────────────────────────────

const DATASETS_DIR = path.join(__dirname, 'data', 'datasets');
if (!fs.existsSync(DATASETS_DIR)) fs.mkdirSync(DATASETS_DIR, { recursive: true });

function sanitizeDatasetName(raw) {
    return path.basename(String(raw || '')).replace(/^\.+/, '').trim().slice(0, 100);
}

function timestampSuffix() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
        + `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

app.get('/api/datasets', (req, res) => {
    try {
        const files = fs.readdirSync(DATASETS_DIR).filter(f => f.endsWith('.json'));
        const list = files.map(f => {
            const full = path.join(DATASETS_DIR, f);
            const stat = fs.statSync(full);
            let count = 0;
            try {
                const data = JSON.parse(fs.readFileSync(full, 'utf8'));
                if (Array.isArray(data)) count = data.length;
            } catch {}
            return { name: f.replace(/\.json$/, ''), count, createdAt: stat.mtimeMs };
        }).sort((a, b) => b.createdAt - a.createdAt);
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/datasets', (req, res) => {
    const { name, properties } = req.body;
    if (!name || !Array.isArray(properties)) {
        return res.status(400).json({ error: 'name and properties required' });
    }
    const safe = sanitizeDatasetName(name);
    if (!safe) return res.status(400).json({ error: 'invalid name' });

    let finalName = safe;
    let filepath = path.join(DATASETS_DIR, finalName + '.json');
    if (fs.existsSync(filepath)) {
        finalName = safe + timestampSuffix();
        filepath = path.join(DATASETS_DIR, finalName + '.json');
    }

    try {
        fs.writeFileSync(filepath, JSON.stringify(properties));
        res.json({ name: finalName, count: properties.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 시작 ────────────────────────────────────────────────

generateConfig();
app.listen(PORT, () => {
    console.log(`서버 실행 중: ${BASE_URL} (포트 ${PORT})`);
});
