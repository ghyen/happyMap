const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
    const { code } = req.query;

    if (!code) {
        res.writeHead(302, { Location: '/?error=no_code' });
        return res.end();
    }

    const clientId = process.env.KAKAO_REST_API_KEY;
    const jwtSecret = process.env.JWT_SECRET;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const redirectUri = `${proto}://${req.headers.host}/api/auth/callback`;

    try {
        // 인가 코드로 토큰 교환
        const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                redirect_uri: redirectUri,
                code
            })
        });

        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            res.writeHead(302, { Location: '/?error=token_failed' });
            return res.end();
        }

        // 사용자 정보 조회
        const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });

        const userData = await userRes.json();

        const user = {
            id: userData.id,
            nickname: userData.properties?.nickname || '',
            profileImage: userData.properties?.profile_image || ''
        };

        // JWT 생성 및 쿠키 설정
        const token = jwt.sign(user, jwtSecret, { expiresIn: '7d' });
        const maxAge = 7 * 24 * 60 * 60;
        const cookie = `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

        res.writeHead(302, {
            'Set-Cookie': cookie,
            Location: '/'
        });
        res.end();
    } catch (err) {
        console.error('Kakao OAuth error:', err);
        res.writeHead(302, { Location: '/?error=auth_failed' });
        res.end();
    }
};
