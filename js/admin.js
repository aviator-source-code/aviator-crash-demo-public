/* =====================================================================
   AVIATOR ADMIN PANEL LOGIC (admin.html)
   Reads/writes the same localStorage used by the game (index.html)
   and live-syncs via the 'storage' event.
   ===================================================================== */

const KEY = {
    user: 'aviator_user',
    tx: 'aviator_tx',
    admin: 'aviator_admin',
    rounds: 'aviator_rounds',
    muted: 'aviator_muted'
};

let user = null;

/* ---------- HELPERS ---------- */
function $(id) { return document.getElementById(id); }

function fmt(n) { return n.toFixed(2); }

function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 3200);
}

/* ---------- STORAGE ---------- */
function loadUser() {
    const raw = localStorage.getItem(KEY.user);
    user = raw ? JSON.parse(raw) : { name: 'Player', balance: 1000, joined: Date.now() };
    if (!raw) saveUser();
}

function saveUser() {
    localStorage.setItem(KEY.user, JSON.stringify(user));
}

function getTx() {
    try { return JSON.parse(localStorage.getItem(KEY.tx) || '[]'); }
    catch (e) { return []; }
}

function saveTx(list) {
    localStorage.setItem(KEY.tx, JSON.stringify(list));
}

function getAdmin() {
    let a = localStorage.getItem(KEY.admin);
    if (!a) {
        a = { password: 'admin' };
        localStorage.setItem(KEY.admin, JSON.stringify(a));
    } else {
        try { a = JSON.parse(a); } catch (e) { a = { password: 'admin' }; }
    }
    return a;
}

function saveAdmin(a) {
    localStorage.setItem(KEY.admin, JSON.stringify(a));
}

/* ---------- AUTH ---------- */
function login() {
    const a = getAdmin();
    const u = $('loginUser').value.trim();
    if (u === 'admin' && $('loginPass').value === a.password) {
        sessionStorage.setItem('aviator_admin_session', '1');
        $('loginScreen').classList.add('hidden');
        $('dashboard').classList.remove('hidden');
        toast('Welcome back, Admin', 'success');
        renderAll();
    } else {
        toast('Incorrect admin credentials', 'error');
        $('loginPass').value = '';
        $('loginPass').focus();
    }
}

function logout() {
    sessionStorage.removeItem('aviator_admin_session');
    $('dashboard').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
    $('loginUser').value = '';
    $('loginPass').value = '';
    $('loginUser').focus();
}

/* ---------- RENDER ---------- */
function renderAll() {
    loadUser();
    renderStats();
    renderPending();
    renderHistory();
    $('playerNameLabel').textContent = user.name;
}

function renderStats() {
    const tx = getTx();
    const pending = tx.filter(t => t.status === 'pending');
    const approvedDeposits = tx.filter(t => t.status === 'approved' && t.type === 'deposit');
    const approvedWithdrawals = tx.filter(t => t.status === 'approved' && t.type === 'withdraw');

    let depSum = 0, wdSum = 0, pendAmt = 0;
    approvedDeposits.forEach(t => depSum += t.amount);
    approvedWithdrawals.forEach(t => wdSum += t.amount);
    pending.forEach(t => pendAmt += t.amount);

    $('statsGrid').innerHTML =
        statCard('Player Balance', '$' + fmt(user.balance), 'success') +
        statCard('Total Deposits', '$' + fmt(depSum), 'success') +
        statCard('Total Withdrawals', '$' + fmt(wdSum), 'warn') +
        statCard('Pending Requests', pending.length + ' · $' + fmt(pendAmt), 'danger') +
        statCard('Approved Requests', (approvedDeposits.length + approvedWithdrawals.length) + '', 'accent');
}

function statCard(label, value, cls) {
    return '<div class="stat-card"><div class="label">' + label + '</div>' +
        '<div class="value ' + (cls || '') + '">' + value + '</div></div>';
}

function renderPending() {
    const tx = getTx();
    const deposits = tx.filter(t => t.status === 'pending' && t.type === 'deposit');
    const withdrawals = tx.filter(t => t.status === 'pending' && t.type === 'withdraw');

    const dEl = $('depositList');
    dEl.innerHTML = '';
    if (!deposits.length) dEl.innerHTML = '<div class="empty-state">No pending deposits 🎉</div>';
    deposits.forEach(t => dEl.appendChild(reqItem(t)));

    const wEl = $('withdrawList');
    wEl.innerHTML = '';
    if (!withdrawals.length) wEl.innerHTML = '<div class="empty-state">No pending withdrawals 🎉</div>';
    withdrawals.forEach(t => wEl.appendChild(reqItem(t)));
}

function reqItem(t) {
    const item = document.createElement('div');
    item.className = 'req-item ' + t.type;
    item.innerHTML =
        '<div class="req-info">' +
        '<b>' + (t.type === 'deposit' ? '💵' : '🏧') + ' ' + t.player +
        ' — ' + (t.type === 'deposit' ? 'Deposit' : 'Withdrawal') + ' $' + fmt(t.amount) + '</b>' +
        '<span class="req-sub">' + fmtDate(t.date) + '</span></div>' +
        '<div class="req-actions">' +
        '<button class="btn-approve" onclick="approveTx(\'' + t.id + '\')">Approve</button>' +
        '<button class="btn-reject" onclick="rejectTx(\'' + t.id + '\')">Reject</button>' +
        '</div>';
    return item;
}

function renderHistory() {
    const tx = getTx().slice().reverse();
    const tbody = $('txBody');
    tbody.innerHTML = '';
    if (!tx.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No transactions yet.</td></tr>';
        return;
    }
    tx.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + fmtDate(t.date) + '</td>' +
            '<td>' + t.player + '</td>' +
            '<td><span class="type-icon">' + (t.type === 'deposit' ? '💵' : '🏧') + '</span>' +
            (t.type === 'deposit' ? 'Deposit' : 'Withdrawal') + '</td>' +
            '<td class="amount ' + (t.type === 'deposit' ? 'pos' : 'neg') + '">' +
            (t.type === 'deposit' ? '+' : '-') + '$' + fmt(t.amount) + '</td>' +
            '<td><span class="badge ' + t.status + '">' + t.status + '</span></td>';
        tbody.appendChild(tr);
    });
}

/* ---------- ACTIONS ---------- */
function approveTx(id) {
    loadUser();
    const tx = getTx();
    const t = tx.find(x => x.id === id);
    if (!t || t.status !== 'pending') return;

    if (t.type === 'deposit') {
        user.balance += t.amount;
        saveUser();
        toast('Deposit of $' + fmt(t.amount) + ' approved and credited', 'success');
    } else {
        toast('Withdrawal of $' + fmt(t.amount) + ' approved and sent', 'success');
    }

    t.status = 'approved';
    saveTx(tx);
    renderAll();
}

function rejectTx(id) {
    loadUser();
    const tx = getTx();
    const t = tx.find(x => x.id === id);
    if (!t || t.status !== 'pending') return;

    if (t.type === 'withdraw') {
        user.balance += t.amount;
        saveUser();
        toast('Withdrawal of $' + fmt(t.amount) + ' rejected — funds returned', 'warn');
    } else {
        toast('Deposit of $' + fmt(t.amount) + ' rejected', 'warn');
    }

    t.status = 'rejected';
    saveTx(tx);
    renderAll();
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $('panel-pending').classList.toggle('active', tab === 'pending');
    $('panel-history').classList.toggle('active', tab === 'history');
    $('panel-settings').classList.toggle('active', tab === 'settings');
}

function changePassword() {
    const a = getAdmin();
    const cur = $('curPass').value;
    const next = $('newPass').value.trim();
    if (cur !== a.password) {
        toast('Current password is incorrect', 'error');
        return;
    }
    if (next.length < 4) {
        toast('New password must be at least 4 characters', 'error');
        return;
    }
    a.password = next;
    saveAdmin(a);
    $('curPass').value = '';
    $('newPass').value = '';
    toast('Admin password changed', 'success');
}

function grantBonus() {
    loadUser();
    user.balance += 1000;
    saveUser();
    renderAll();
    toast('Granted $1,000.00 to ' + user.name, 'success');
}

function resetAllData() {
    if (!confirm('Reset ALL data? This clears the player profile, transactions, rounds, and admin settings.')) return;
    Object.keys(KEY).forEach(k => localStorage.removeItem(KEY[k]));
    location.reload();
}

/* ---------- LIVE SYNC ---------- */
window.addEventListener('storage', (e) => {
    if (e.key === KEY.user || e.key === KEY.tx || e.key === KEY.admin) {
        renderAll();
    }
});

/* ---------- INIT ---------- */
function init() {
    if (sessionStorage.getItem('aviator_admin_session') === '1') {
        $('loginScreen').classList.add('hidden');
        $('dashboard').classList.remove('hidden');
        renderAll();
    } else {
        $('loginUser').focus();
    }

    $('loginUser').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('loginPass').focus();
    });
    $('loginPass').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') login();
    });

    setInterval(renderAll, 4000);
}

init();
