const SocialModule = (function () {
    function encodePath(dataset, address) {
        return `/api/social/${encodeURIComponent(dataset)}/${encodeURIComponent(address)}`;
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr + 'Z').getTime();
        const min = Math.floor(diff / 60000);
        if (min < 1) return '방금';
        if (min < 60) return `${min}분 전`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}시간 전`;
        return `${Math.floor(hr / 24)}일 전`;
    }

    async function load(dataset, address) {
        const res = await fetch(encodePath(dataset, address));
        return res.json();
    }

    async function toggleLike(dataset, address) {
        const res = await fetch(encodePath(dataset, address) + '/like', { method: 'POST' });
        if (res.status === 401) { App.showToast('로그인이 필요합니다'); return null; }
        return res.json();
    }

    async function addComment(dataset, address, content) {
        const res = await fetch(encodePath(dataset, address) + '/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        if (res.status === 401) { App.showToast('로그인이 필요합니다'); return null; }
        return res.json();
    }

    async function deleteComment(id) {
        const res = await fetch(`/api/social/comment/${id}`, { method: 'DELETE' });
        return res.ok;
    }

    async function renderSocialSection(dataset, address, container) {
        const data = await load(dataset, address);
        const user = AuthModule.getUser();

        const commentsHtml = data.comments.map(c => `
            <div class="comment-item">
                ${c.profileImage ? `<img class="comment-avatar" src="${c.profileImage}" alt="">` : '<div class="comment-avatar-placeholder"></div>'}
                <div class="comment-body">
                    <span class="comment-author">${c.nickname}</span>
                    <span class="comment-text">${c.content.replace(/</g, '&lt;')}</span>
                    <span class="comment-time">${timeAgo(c.createdAt)}</span>
                    ${c.isMine ? `<button class="comment-delete" data-id="${c.id}">삭제</button>` : ''}
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="like-area">
                <button class="like-btn ${data.liked ? 'liked' : ''}">
                    <span class="like-heart">${data.liked ? '♥' : '♡'}</span>
                    <span class="like-count">${data.likeCount}</span>
                </button>
            </div>
            <div class="comments-area">${commentsHtml || '<div class="no-comments">아직 댓글이 없습니다</div>'}</div>
            ${user
                ? `<div class="comment-form">
                       <input type="text" class="comment-input" placeholder="댓글을 입력하세요" maxlength="500">
                       <button class="comment-submit">등록</button>
                   </div>`
                : `<div class="comment-login-prompt">댓글을 남기려면 <a href="#" class="social-login-link">로그인</a>하세요</div>`
            }
        `;

        // 이벤트 바인딩
        const likeBtn = container.querySelector('.like-btn');
        likeBtn.addEventListener('click', async () => {
            const result = await toggleLike(dataset, address);
            if (!result) return;
            likeBtn.classList.toggle('liked', result.liked);
            likeBtn.querySelector('.like-heart').textContent = result.liked ? '♥' : '♡';
            likeBtn.querySelector('.like-count').textContent = result.likeCount;
        });

        const submitBtn = container.querySelector('.comment-submit');
        const input = container.querySelector('.comment-input');
        if (submitBtn && input) {
            const submit = async () => {
                const content = input.value.trim();
                if (!content) return;
                const comment = await addComment(dataset, address, content);
                if (comment) {
                    input.value = '';
                    renderSocialSection(dataset, address, container);
                }
            };
            submitBtn.addEventListener('click', submit);
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') submit(); });
        }

        container.querySelectorAll('.comment-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (await deleteComment(btn.dataset.id)) {
                    renderSocialSection(dataset, address, container);
                }
            });
        });

        const loginLink = container.querySelector('.social-login-link');
        if (loginLink) loginLink.addEventListener('click', (e) => { e.preventDefault(); AuthModule.login(); });
    }

    return { renderSocialSection };
})();
