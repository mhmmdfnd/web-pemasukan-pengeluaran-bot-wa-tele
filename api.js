async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username: u, password: p })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            currentUser = data.user;
            localStorage.setItem('current_logged_user', JSON.stringify(currentUser));
            errorEl.classList.add('hidden');
            initApp();
            return;
        }
    } catch (err) {
        console.warn("Backend belum siap, masuk dengan fallback admin...", err);
    }

    // Fallback Admin Offline
    if (u === 'admin' && p === 'admin123') {
        currentUser = { id: 1, username: 'admin', role: 'admin', botToken: '', chatId: '' };
        localStorage.setItem('current_logged_user', JSON.stringify(currentUser));
        errorEl.classList.add('hidden');
        initApp();
    } else {
        errorEl.innerText = 'Username atau Password salah!';
        errorEl.classList.remove('hidden');
    }
}
