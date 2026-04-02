module.exports = function handler(req, res) {
    res.writeHead(302, {
        'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
        Location: '/'
    });
    res.end();
};
