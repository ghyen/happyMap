module.exports = function handler(req, res) {
    const clientId = process.env.KAKAO_REST_API_KEY;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const redirectUri = `${proto}://${req.headers.host}/api/auth/callback`;

    const url = `https://kauth.kakao.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

    res.writeHead(302, { Location: url });
    res.end();
};
