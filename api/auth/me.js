const jwt = require('jsonwebtoken');

function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach(c => {
        const [name, ...rest] = c.trim().split('=');
        cookies[name] = rest.join('=');
    });
    return cookies;
}

module.exports = function handler(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.auth_token;

    if (!token) {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ user: null }));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = { id: decoded.id, nickname: decoded.nickname, profileImage: decoded.profileImage };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ user }));
    } catch {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ user: null }));
    }
};
