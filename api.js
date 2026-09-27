/* =========================================================
   FINANCIAL TRACKER PRO - ONLINE AUTHENTICATION & MASTER LOGIC
   ========================================================= */

let currentUser = JSON.parse(localStorage.getItem('current_logged_user') || 'null');
let usersDB = [];
let globalTransactions = [];
let targetBudgets = [];
let debts = [];

let categoryChartInstance = null;
let flowLineChartInstance = null;
let pendingDeleteId = null;

// Inisialisasi Aplikasi
async function initApp() {
    if (!currentUser) {
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    } else {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        
        document.getElementById('current-user-display').innerText = currentUser.username;
        document.getElementById('current-role-display').innerText = currentUser.role;

        if (currentUser.role === 'admin') {
            document.getElementById('admin-panel-btn').classList.remove('hidden');
            await fetchOnlineUsers();
        } else {
            document.getElementById('admin-panel-btn').classList.add('hidden');
        }

        // Load data spesifik user
        targetBudgets = JSON.parse(localStorage.getItem(`target_budgets_${currentUser.username}`) || '[]');
        debts = JSON.parse(localStorage.getItem(`debts_${currentUser.username}`) || '[]');

        loadTransactions();
        renderDebts();
        renderTargets();
    }
}

// 1. HANDLER LOGIN VIA DATABASE SERVER
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
        } else {
            errorEl.innerText = data.message || 'Username atau Password salah!';
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Gagal login:", err);
        errorEl.innerText = 'Terjadi kesalahan jaringan/server!';
        errorEl.classList.remove('hidden');
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('current_logged_user');
    initApp();
}

function toggleAdminPanel() {
    document.getElementById('admin-view-section').classList.toggle('hidden');
}

// 2. FETCH DAFTAR USER DARI SERVER (KHUSUS ADMIN)
async function fetchOnlineUsers() {
    try {
        const res = await fetch('/api/auth');
        const data = await res.json();
        if (data.success) {
            usersDB = data.users;
            renderUsersTable();
        }
    } catch (err) {
        console.error("Gagal memuat pengguna:", err);
    }
}

// 3. TAMBAH USER BARU KE DATABASE SERVER
async function saveNewUser() {
    const u = document.getElementById('new-username').value;
    const p = document.getElementById('new-password').value;
    const botToken = document.getElementById('new-bot-token').value;
    const chatId = document.getElementById('new-chat-id').value;
    const r = document.getElementById('new-role').value;

    if (u && p) {
        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'register',
                    username: u,
                    password: p,
                    botToken: botToken || '',
                    chatId: chatId || '',
                    role: r
                })
            });

            const data = await response.json();
            if (data.success) {
                closeAddUserModal();
                fetchOnlineUsers();
                
                document.getElementById('new-username').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('new-bot-token').value = '';
                document.getElementById('new-chat-id').value = '';
            } else {
                alert('Gagal menambah user: ' + (data.message || 'Username mungkin sudah dipakai.'));
            }
        } catch (err) {
            console.error("Gagal mendaftarkan user:", err);
        }
    }
}

// 4. HAPUS USER DARI DATABASE SERVER
async function deleteUser(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus user ini?')) return;
    try {
        const res = await fetch('/api/auth', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            fetchOnlineUsers();
        }
    } catch (err) {
        console.error("Gagal menghapus user:", err);
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('user-rows');
    if (!tbody) return;
    let html = '';
    usersDB.forEach(u => {
        html += `
            <tr class="border-b border-slate-100 dark:border-slate-700 text-xs">
                <td class="p-3 font-semibold">#${u.id}</td>
                <td class="p-3 font-bold text-indigo-600 dark:text-indigo-400">${u.username}</td>
                <td class="p-3 text-slate-500 font-mono text-[11px]">${u.botToken ? u.botToken.substring(0, 10) + '...' : '-'}</td>
                <td class="p-3 text-slate-500 font-mono text-[11px]">${u.chatId || '-'}</td>
                <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}">${u.role}</span></td>
                <td class="p-3 text-center">
                    ${u.username !== 'admin' ? `<button onclick="deleteUser(${u.id})" class="text-rose-600 hover:underline font-semibold">Hapus</button>` : '-'}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}
