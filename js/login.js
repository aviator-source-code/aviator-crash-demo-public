/* ============================================================
   AVIATOR LOGIN PAGE (login.html)
   Player sign-in with local account registration. No admin
   access here — the admin panel is reached only via its own
   direct link and has its own login (js/admin.js).
   On success the game page (index.html) is opened and a
   player session is stored in sessionStorage.
   ============================================================ */

const ACCOUNTS_KEY = 'aviator_accounts';
const USER_KEY = 'aviator_user';

let mode = 'login';

function $(id) { return document.getElementById(id); }

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

/* ---------- ACCOUNTS (localStorage) ---------- */
function getAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; }
    catch (e) { return []; }
}

function saveAccounts(list) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

function seedAccounts() {
    if (!getAccounts().length) {
        saveAccounts([{ u: 'test', p: 'test', created: Date.now() }]);
    }
}

/* ---------- MODE (login / register) ---------- */
function switchMode(next) {
    mode = next;
    $('tabLogin').classList.toggle('active', next === 'login');
    $('tabRegister').classList.toggle('active', next === 'register');
    $('confirmField').classList.toggle('hidden', next !== 'register');
    $('password').autocomplete = next === 'register' ? 'new-password' : 'current-password';

    const btn = $('loginBtn');
    btn.textContent = next === 'login' ? 'Login' : 'Create Account';
    btn.onclick = next === 'login' ? doLogin : doRegister;

    $('password').value = '';
    $('confirm').value = '';
    $('username').focus();
}

/* ---------- AUTH ---------- */
function establishPlayerSession(name) {
    sessionStorage.setItem('aviator_player_session', '1');
    if (!localStorage.getItem(USER_KEY)) {
        localStorage.setItem(USER_KEY, JSON.stringify({
            name: name,
            balance: 1000,
            joined: Date.now()
        }));
    }
    location.href = 'index.html';
}

function doLogin() {
    const u = $('username').value.trim();
    const p = $('password').value;

    const acc = getAccounts().find(a => a.u === u);
    if (acc && acc.p === p) {
        establishPlayerSession(acc.u);
    } else {
        toast('Invalid username or password', 'error');
        $('password').value = '';
        $('password').focus();
    }
}

function doRegister() {
    const u = $('username').value.trim();
    const p = $('password').value;
    const c = $('confirm').value;

    if (u.length < 3) {
        toast('Username must be at least 3 characters', 'error');
        return;
    }
    if (p.length < 4) {
        toast('Password must be at least 4 characters', 'error');
        return;
    }
    if (p !== c) {
        toast('Passwords do not match', 'error');
        $('confirm').value = '';
        $('confirm').focus();
        return;
    }

    const list = getAccounts();
    if (list.some(a => a.u.toLowerCase() === u.toLowerCase())) {
        toast('Username already taken', 'error');
        return;
    }

    list.push({ u: u, p: p, created: Date.now() });
    saveAccounts(list);
    toast('Account created. Welcome, ' + u + '!', 'success');
    establishPlayerSession(u);
}

/* ---------- INIT ---------- */
function init() {
    seedAccounts();
    $('loginBtn').onclick = doLogin;
    $('username').focus();

    $('username').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('password').focus();
    });

    $('password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (mode === 'register') $('confirm').focus();
            else doLogin();
        }
    });

    $('confirm').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doRegister();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            $('password').value = '';
            $('confirm').value = '';
            $('username').focus();
        }
    });
}

init();
