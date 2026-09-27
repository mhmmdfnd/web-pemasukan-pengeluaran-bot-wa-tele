/* =========================================================
   FINANCIAL TRACKER PRO - MASTER LOGIC & MULTI-USER HANDLER
   ========================================================= */

// Inisialisasi Database User Sederhana di LocalStorage
let usersDB = JSON.parse(localStorage.getItem('app_users_db') || JSON.stringify([
    { 
        id: 1, 
        username: 'admin', 
        password: 'admin123', 
        botToken: '', 
        chatId: '', 
        role: 'admin' 
    }
]));

let currentUser = JSON.parse(localStorage.getItem('current_logged_user') || 'null');
let globalTransactions = [];
let targetBudgets = [];
let debts = [];

let categoryChartInstance = null;
let flowLineChartInstance = null;
let pendingDeleteId = null;
let pendingDeleteDebtId = null;
let activePayDebtId = null;
let activeTargetDepositId = null;

const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// Inisialisasi Aplikasi Sesuai Sesi Login
function initApp() {
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
        } else {
            document.getElementById('admin-panel-btn').classList.add('hidden');
        }

        // Muat Data Lokal Spesifik Pengguna
        targetBudgets = JSON.parse(localStorage.getItem(`target_budgets_${currentUser.username}`) || '[]');
        debts = JSON.parse(localStorage.getItem(`debts_${currentUser.username}`) || '[]');

        loadTransactions();
        renderUsersTable();
        renderDebts();
        renderTargets();
    }
}

// Handler Autentikasi
function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;

    const foundUser = usersDB.find(x => x.username === u && x.password === p);

    if (foundUser) {
        currentUser = foundUser;
        localStorage.setItem('current_logged_user', JSON.stringify(currentUser));
        document.getElementById('login-error').classList.add('hidden');
        initApp();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
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

// Modal User
function openAddUserModal() { document.getElementById('add-user-modal').classList.remove('hidden'); }
function closeAddUserModal() { document.getElementById('add-user-modal').classList.add('hidden'); }

function saveNewUser() {
    const u = document.getElementById('new-username').value;
    const p = document.getElementById('new-password').value;
    const botToken = document.getElementById('new-bot-token').value;
    const chatId = document.getElementById('new-chat-id').value;
    const r = document.getElementById('new-role').value;

    if (u && p) {
        const newUser = { 
            id: Date.now(), 
            username: u, 
            password: p, 
            botToken: botToken || '', 
            chatId: chatId || '', 
            role: r 
        };
        usersDB.push(newUser);
        localStorage.setItem('app_users_db', JSON.stringify(usersDB));
        closeAddUserModal();
        renderUsersTable();
        
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('new-bot-token').value = '';
        document.getElementById('new-chat-id').value = '';
    }
}

function deleteUser(id) {
    usersDB = usersDB.filter(x => x.id !== id);
    localStorage.setItem('app_users_db', JSON.stringify(usersDB));
    renderUsersTable();
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

// Kirim Transaksi Otomatis ke DB / Telegram API
async function sendTransactionToDB(title, amount, type, category) {
    try {
        let textFormat = `${title} ${amount}`;
        if (type === 'income') {
            textFormat = `pemasukan ${title} ${amount} : ${category}`;
        } else {
            textFormat = `pengeluaran ${title} ${amount} : ${category}`;
        }

        const payload = {
            message: {
                chat: { id: currentUser && currentUser.chatId ? currentUser.chatId : 0 },
                text: textFormat
            },
            bot_token: currentUser && currentUser.botToken ? currentUser.botToken : ''
        };

        await fetch('/api/index', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        loadTransactions();
    } catch (error) {
        console.error("Gagal mengirim transaksi:", error);
    }
}

// Memuat data dari backend Neon DB / Telegram Webhook
async function loadTransactions() {
    try {
        const response = await fetch('/api/get-transactions');
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        globalTransactions = data;
        applyGlobalDateFilter();
        updateFlowLineChart();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function getTimeStamp(dateStr) { return dateStr ? new Date(dateStr).getTime() : 0; }

function applyGlobalDateFilter() {
    const startDateVal = document.getElementById('filter-start-date').value;
    const endDateVal = document.getElementById('filter-end-date').value;

    let filtered = globalTransactions;

    if (startDateVal) {
        const start = new Date(startDateVal).setHours(0,0,0,0);
        filtered = filtered.filter(item => getTimeStamp(item.created_at) >= start);
    }

    if (endDateVal) {
        const end = new Date(endDateVal).setHours(23,59,59,999);
        filtered = filtered.filter(item => getTimeStamp(item.created_at) <= end);
    }

    renderDashboard(filtered);
}

function resetGlobalDateFilter() {
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    renderDashboard(globalTransactions);
}

function resetFlowDateFilter() {
    document.getElementById('flow-start-date').value = '';
    document.getElementById('flow-end-date').value = '';
    updateFlowLineChart();
}

function updateFlowLineChart() {
    const startDateVal = document.getElementById('flow-start-date').value;
    const endDateVal = document.getElementById('flow-end-date').value;

    let filtered = globalTransactions;

    if (startDateVal) {
        const start = new Date(startDateVal).setHours(0,0,0,0);
        filtered = filtered.filter(item => getTimeStamp(item.created_at) >= start);
    }

    if (endDateVal) {
        const end = new Date(endDateVal).setHours(23,59,59,999);
        filtered = filtered.filter(item => getTimeStamp(item.created_at) <= end);
    }

    const sorted = [...filtered].sort((a, b) => getTimeStamp(a.created_at) - getTimeStamp(b.created_at));
    const groupedDates = {};

    sorted.forEach(item => {
        const dateKey = formatDate(item.created_at);
        if (!groupedDates[dateKey]) groupedDates[dateKey] = { income: 0, expense: 0 };
        const amt = Number(item.amount) || 0;
        if (item.type === 'income') groupedDates[dateKey].income += amt;
        else groupedDates[dateKey].expense += amt;
    });

    const labels = Object.keys(groupedDates);
    const incomeData = [], expenseData = [], netData = [];

    labels.forEach(d => {
        const inc = groupedDates[d].income;
        const exp = groupedDates[d].expense;
        incomeData.push(inc);
        expenseData.push(exp);
        netData.push(inc - exp);
    });

    renderFlowLineChart(labels, incomeData, expenseData, netData);
}

function renderFlowLineChart(labels, incomeData, expenseData, netData) {
    const ctx = document.getElementById('flowLineChart').getContext('2d');
    if (flowLineChartInstance) flowLineChartInstance.destroy();

    flowLineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['Belum Ada Data'],
            datasets: [
                { label: 'Pemasukan', data: incomeData.length > 0 ? incomeData : [0], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.3, borderWidth: 2 },
                { label: 'Pengeluaran', data: expenseData.length > 0 ? expenseData : [0], borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3, borderWidth: 2 },
                { label: 'Saldo Bersih', data: netData.length > 0 ? netData : [0], borderColor: '#6366f1', borderDash: [5, 5], tension: 0.3, borderWidth: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderDashboard(transactions) {
    const tableBody = document.getElementById('transaction-rows');
    let totalIncome = 0, totalExpense = 0;
    const categoryTotals = {};

    if (!transactions || transactions.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Belum ada transaksi pada periode ini.</td></tr>`;
        document.getElementById('total-saldo').innerText = 'Rp 0';
        document.getElementById('total-pemasukan').innerText = 'Rp 0';
        document.getElementById('total-pengeluaran').innerText = 'Rp 0';
        renderChart({});
        return;
    }

    let rowsHtml = '';
    transactions.forEach(item => {
        const amount = Number(item.amount) || 0;
        const isIncome = item.type === 'income';

        if (isIncome) totalIncome += amount;
        else {
            totalExpense += amount;
            const cat = item.category || 'Umum';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
        }

        const safeTitle = item.title.replace(/'/g, "\\'");

        rowsHtml += `
            <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                <td class="p-3.5 font-bold text-indigo-600 dark:text-indigo-400 text-xs">#${item.id}</td>
                <td class="p-3.5 text-slate-400 text-xs whitespace-nowrap">${formatDate(item.created_at)}</td>
                <td class="p-3.5 font-semibold text-slate-800 dark:text-slate-200">${item.title}</td>
                <td class="p-3.5"><span class="bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-md text-xs">${item.category || 'Umum'}</span></td>
                <td class="p-3.5"><span class="${isIncome ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'} text-xs px-2.5 py-1 rounded-md font-semibold">${isIncome ? 'Pemasukan' : 'Pengeluaran'}</span></td>
                <td class="p-3.5 text-right font-bold whitespace-nowrap ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${isIncome ? '+' : '-'} ${formatRupiah(amount)}</td>
                <td class="p-3.5 text-center">
                    <button onclick="openDeleteModal(${item.id}, '${safeTitle}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"><i class="fa-regular fa-trash-can text-sm"></i></button>
                </td>
            </tr>
        `;
    });

    document.getElementById('total-saldo').innerText = formatRupiah(totalIncome - totalExpense);
    document.getElementById('total-pemasukan').innerText = formatRupiah(totalIncome);
    document.getElementById('total-pengeluaran').innerText = formatRupiah(totalExpense);

    tableBody.innerHTML = rowsHtml;
    renderChart(categoryTotals);
}

function renderChart(categoryData) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const labels = Object.keys(categoryData);
    const values = Object.values(categoryData);

    if (categoryChartInstance) categoryChartInstance.destroy();
    if (labels.length === 0) return;

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: values, backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'], borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
    });
}

// TARGET BUDGET FUNCTIONS
function saveTargetBudget() {
    const name = document.getElementById('target-name').value || 'Target Utama';
    const bank = document.getElementById('target-bank').value || 'BCA';
    const month = Number(document.getElementById('target-month').value);
    const year = Number(document.getElementById('target-year').value);
    const amount = parseRupiahNumber(document.getElementById('target-amount').value);

    if (amount > 0) {
        targetBudgets.push({ id: Date.now(), name, bank, month, year, amount, currentSaved: 0 });
        localStorage.setItem(`target_budgets_${currentUser.username}`, JSON.stringify(targetBudgets));
        closeTargetModal();
        document.getElementById('target-name').value = '';
        document.getElementById('target-amount').value = '';
        renderTargets();
    }
}

function removeTarget(id) {
    targetBudgets = targetBudgets.filter(t => t.id !== id);
    localStorage.setItem(`target_budgets_${currentUser.username}`, JSON.stringify(targetBudgets));
    renderTargets();
}

function openTargetDepositModal(id, name) {
    activeTargetDepositId = id;
    document.getElementById('target-deposit-name').innerText = `Target: ${name}`;
    document.getElementById('deposit-amount').value = '';
    document.getElementById('add-target-savings-modal').classList.remove('hidden');
}

function closeTargetDepositModal() {
    activeTargetDepositId = null;
    document.getElementById('add-target-savings-modal').classList.add('hidden');
}

async function submitTargetDeposit() {
    if (!activeTargetDepositId) return;

    const depositVal = parseRupiahNumber(document.getElementById('deposit-amount').value);
    if (depositVal <= 0) return;

    let targetObj = null;

    targetBudgets = targetBudgets.map(t => {
        if (t.id === activeTargetDepositId) {
            targetObj = t;
            const updatedSaved = (t.currentSaved || 0) + depositVal;
            return { ...t, currentSaved: updatedSaved };
        }
        return t;
    });

    localStorage.setItem(`target_budgets_${currentUser.username}`, JSON.stringify(targetBudgets));
    closeTargetDepositModal();
    renderTargets();

    if (targetObj) {
        await sendTransactionToDB(`Tabungan ${targetObj.name} (${targetObj.bank})`, depositVal, 'expense', 'Tabungan');
    }
}

function renderTargets() {
    const container = document.getElementById('target-list-container');
    if (!container) return;
    if (targetBudgets.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada target bulanan yang diset.</p>`;
        return;
    }
    let html = '';
    targetBudgets.forEach(t => {
        const currentSaved = t.currentSaved || 0;
        const percent = Math.min(Math.round((currentSaved / t.amount) * 100), 100);
        const safeName = t.name.replace(/'/g, "\\'");

        html += `
            <div class="p-3.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-700/80 space-y-2">
                <div class="flex justify-between items-center text-xs">
                    <div>
                        <span class="font-bold text-slate-800 dark:text-slate-200 block">${t.name}</span>
                        <div class="flex items-center gap-1.5 mt-0.5">
                            <span class="text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold px-1.5 py-0.5 rounded">${t.bank}</span>
                            <span class="text-[10px] text-slate-400 font-medium">• ${monthNames[t.month]} ${t.year}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-indigo-600 font-bold text-xs">${percent}%</span>
                        <button onclick="removeTarget(${t.id})" class="text-slate-400 hover:text-rose-600 text-xs"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>

                <div class="w-full bg-slate-200 dark:bg-slate-600 h-2.5 rounded-full overflow-hidden">
                    <div class="bg-indigo-600 h-full transition-all duration-300" style="width: ${percent}%"></div>
                </div>

                <div class="flex justify-between items-center text-[11px] pt-1">
                    <div class="text-slate-400">
                        <span>Terkumpul: <strong class="text-emerald-600 dark:text-emerald-400 font-bold">${formatRupiah(currentSaved)}</strong></span> /
                        <span>Target: <strong class="text-slate-600 dark:text-slate-300">${formatRupiah(t.amount)}</strong></span>
                    </div>
                    <button onclick="openTargetDepositModal(${t.id}, '${safeName}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] rounded-lg shadow-sm transition">
                        + Setor Tabungan
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// UTANG & PIUTANG FUNCTIONS
function saveDebt() {
    const name = document.getElementById('debt-name').value;
    const type = document.getElementById('debt-type').value;
    const amount = parseRupiahNumber(document.getElementById('debt-amount').value);

    if (name && amount > 0) {
        debts.push({ id: Date.now(), name, type, amount, history: [] });
        localStorage.setItem(`debts_${currentUser.username}`, JSON.stringify(debts));
        closeDebtModal();
        document.getElementById('debt-name').value = '';
        document.getElementById('debt-amount').value = '';
        renderDebts();
    }
}

function openDeleteDebtModal(id, name) {
    pendingDeleteDebtId = id;
    document.getElementById('debt-delete-desc').innerText = `Apakah Anda yakin ingin menghapus catatan utang/piutang "${name}"?`;
    document.getElementById('delete-debt-modal').classList.remove('hidden');
}

function closeDeleteDebtModal() {
    pendingDeleteDebtId = null;
    document.getElementById('delete-debt-modal').classList.add('hidden');
}

function confirmDeleteDebt() {
    if (!pendingDeleteDebtId) return;
    debts = debts.filter(d => d.id !== pendingDeleteDebtId);
    localStorage.setItem(`debts_${currentUser.username}`, JSON.stringify(debts));
    closeDeleteDebtModal();
    renderDebts();
}

function openPayInstallmentModal(id, name) {
    activePayDebtId = id;
    document.getElementById('pay-target-name').innerText = `Pembayaran cicilan untuk: ${name}`;
    document.getElementById('pay-amount').value = '';
    document.getElementById('pay-note').value = '';
    document.getElementById('pay-installment-modal').classList.remove('hidden');
}

function closePayInstallmentModal() {
    activePayDebtId = null;
    document.getElementById('pay-installment-modal').classList.add('hidden');
}

async function submitInstallmentPayment() {
    if (!activePayDebtId) return;

    const payAmount = parseRupiahNumber(document.getElementById('pay-amount').value);
    const bankMethod = document.getElementById('pay-bank').value || 'Cash';
    const note = document.getElementById('pay-note').value || 'Cicilan / Angsuran';

    if (payAmount <= 0) return;

    let debtObj = null;

    debts = debts.map(item => {
        if (item.id === activePayDebtId) {
            debtObj = item;
            const newAmount = Math.max(0, item.amount - payAmount);
            const newHistory = item.history || [];
            newHistory.unshift({
                id: Date.now(),
                date: new Date().toISOString(),
                amount: payAmount,
                bank: bankMethod,
                note: note,
                remaining: newAmount
            });
            return { ...item, amount: newAmount, history: newHistory };
        }
        return item;
    }).filter(item => item.amount > 0 || (item.history && item.history.length > 0));

    localStorage.setItem(`debts_${currentUser.username}`, JSON.stringify(debts));
    closePayInstallmentModal();
    renderDebts();

    if (debtObj) {
        if (debtObj.type === 'utang') {
            await sendTransactionToDB(`Bayar Utang ${debtObj.name} via ${bankMethod}`, payAmount, 'expense', 'Utang');
        } else {
            await sendTransactionToDB(`Pelunasan Piutang ${debtObj.name} via ${bankMethod}`, payAmount, 'income', 'Piutang');
        }
    }
}

function openHistoryModal(id) {
    const item = debts.find(d => d.id === id);
    if (!item) return;

    document.getElementById('history-debt-name').innerText = `${item.name} (${item.type === 'utang' ? 'Utang Saya' : 'Piutang'})`;
    const container = document.getElementById('history-list-container');

    if (!item.history || item.history.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada riwayat pembayaran.</p>`;
    } else {
        let html = '';
        item.history.forEach(h => {
            html += `
                <div class="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center text-xs">
                    <div>
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-800 dark:text-slate-200 block">${h.note}</span>
                            <span class="text-[9px] bg-indigo-100 text-indigo-700 font-bold px-1 rounded">${h.bank || 'Cash'}</span>
                        </div>
                        <span class="text-[10px] text-slate-400">${formatDate(h.date)}</span>
                    </div>
                    <div class="text-right">
                        <span class="font-bold text-emerald-600 dark:text-emerald-400 block">- ${formatRupiah(h.amount)}</span>
                        <span class="text-[10px] text-slate-400">Sisa: ${formatRupiah(h.remaining)}</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    document.getElementById('history-modal').classList.remove('hidden');
}

function closeHistoryModal() {
    document.getElementById('history-modal').classList.add('hidden');
}

function renderDebts() {
    const container = document.getElementById('debt-rows');
    if (!container) return;
    if (debts.length === 0) {
        container.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada catatan utang/piutang.</td></tr>`;
        return;
    }

    let html = '';
    debts.forEach(item => {
        const isUtang = item.type === 'utang';
        const safeName = item.name.replace(/'/g, "\\'");
        const historyCount = item.history ? item.history.length : 0;

        html += `
            <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                <td class="p-3 font-semibold">${item.name}</td>
                <td class="p-3">
                    <span class="${isUtang ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'} text-xs px-2 py-0.5 rounded font-medium">
                        ${isUtang ? 'Utang Saya' : 'Piutang'}
                    </span>
                </td>
                <td class="p-3 font-bold">${formatRupiah(item.amount)}</td>
                <td class="p-3">
                    <button onclick="openHistoryModal(${item.id})" class="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1">
                        <i class="fa-solid fa-clock-rotate-left"></i> ${historyCount} Pembayaran
                    </button>
                </td>
                <td class="p-3 text-center flex items-center justify-center gap-1.5">
                    <button onclick="openPayInstallmentModal(${item.id}, '${safeName}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm">
                        Bayar Cicilan
                    </button>
                    <button onclick="openDeleteDebtModal(${item.id}, '${safeName}')" class="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition" title="Hapus Utang">
                        <i class="fa-regular fa-trash-can text-sm"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    container.innerHTML = html;
}

// MODAL CONTROLLERS & UTILITY
function openInputMenuModal() { document.getElementById('input-menu-modal').classList.remove('hidden'); }
function closeInputMenuModal() { document.getElementById('input-menu-modal').classList.add('hidden'); }
function openTargetModal() { document.getElementById('target-modal').classList.remove('hidden'); }
function closeTargetModal() { document.getElementById('target-modal').classList.add('hidden'); }
function openDebtModal() { document.getElementById('debt-modal').classList.remove('hidden'); }
function closeDebtModal() { document.getElementById('debt-modal').classList.add('hidden'); }

function openDeleteModal(id, title) {
    pendingDeleteId = id;
    document.getElementById('modal-desc').innerText = `Apakah Anda yakin ingin menghapus transaksi "${title}" (ID #${id})?`;
    document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('delete-modal').classList.add('hidden');
}

function setupEventListeners() {
    const confirmBtn = document.getElementById('confirm-delete-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!pendingDeleteId) return;
            try {
                await fetch('/api/index', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: { chat: { id: 0 }, text: `hapus ${pendingDeleteId}` } })
                });
                closeDeleteModal();
                loadTransactions();
            } catch (error) { console.error(error); }
        });
    }
}

function formatRupiahInput(input) {
    let value = input.value.replace(/\D/g, '');
    input.value = value ? 'Rp ' + new Intl.NumberFormat('id-ID').format(value) : '';
}

function parseRupiahNumber(str) { return Number(str.replace(/\D/g, '')) || 0; }
function formatRupiah(number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number); }
function formatDate(dateString) { return dateString ? new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'; }

function toggleDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        if (icon) icon.className = 'fa-solid fa-moon';
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.add('dark');
        if (icon) icon.className = 'fa-solid fa-sun';
        localStorage.setItem('theme', 'dark');
    }
}

if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
    window.addEventListener('DOMContentLoaded', () => {
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = 'fa-solid fa-sun';
    });
}

// Inisialisasi Saat Halaman Selesai Dimuat
window.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
    setInterval(loadTransactions, 5000);
});