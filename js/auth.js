const AuthModule = (function () {
    let currentUser = null;

    async function checkLogin() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            currentUser = data.user;
        } catch {
            currentUser = null;
        }
        updateUI();
        return currentUser;
    }

    function login() {
        window.location.href = '/api/auth/kakao';
    }

    function logout() {
        window.location.href = '/api/auth/logout';
    }

    function getUser() {
        return currentUser;
    }

    function updateUI() {
        const loginBtn = document.getElementById('login-btn');
        const userInfo = document.getElementById('user-info');
        if (!loginBtn || !userInfo) return;

        if (currentUser) {
            loginBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            const img = userInfo.querySelector('.profile-img');
            const name = userInfo.querySelector('.nickname');
            if (currentUser.profileImage) {
                img.src = currentUser.profileImage;
                img.style.display = 'block';
            } else {
                img.style.display = 'none';
            }
            name.textContent = currentUser.nickname;
        } else {
            loginBtn.style.display = 'block';
            userInfo.style.display = 'none';
        }
    }

    function init() {
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        if (loginBtn) loginBtn.addEventListener('click', login);
        if (logoutBtn) logoutBtn.addEventListener('click', logout);
        checkLogin();
    }

    return { init, getUser, checkLogin, login, logout };
})();
