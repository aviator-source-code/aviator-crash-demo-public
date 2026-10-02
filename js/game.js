/* =====================================================================
   AVIATOR GAME LOGIC (index.html)
   Admin approvals now live in the separate admin.html panel.
   The two pages share localStorage and sync via the 'storage' event.
   ===================================================================== */

/* ---------- STATE ---------- */
const KEY = {
    user: 'aviator_user',
    tx: 'aviator_tx',
    rounds: 'aviator_rounds',
    muted: 'aviator_muted'
};

let user = null;
let rounds = [];
let players = [];
let currentBet = 0;
let multiplier = 1.00;
let crashPoint = 0;
let isFlying = false;
let betPlaced = false;
let playerCashed = false;
let gamePhase = 'betting';
let countdown = 10;
let countdownInterval = null;
let gameInterval = null;
let autoCashoutEnabled = false;
let autoCashoutTarget = 2.00;
let totalPayout = 0;

let audioCtx = null;
let muted = false;

const FAKE_NAMES = ['Alex', 'Maria', 'Ken', 'Sofia', 'Rashid', 'Elena', 'Jack', 'Mia', 'Leo',
    'Nina', 'Omar', 'Tara', 'Viktor', 'Ana', 'Yuki', 'Ben', 'Lena', 'Sam', 'Zara', 'Ivan', 'Dina', 'Marco'];

/* ---------- STORAGE HELPERS ---------- */
function loadUser() {
    const raw = localStorage.getItem(KEY.user);
    if (raw) {
        user = JSON.parse(raw);
    } else {
        user = { name: 'Player', balance: 1000, joined: Date.now() };
        saveUser();
    }
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

function saveRounds() {
    localStorage.setItem(KEY.rounds, JSON.stringify(rounds));
}

/* ---------- UI HELPERS ---------- */
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

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function showMessage(text, type) {
    const m = $('message');
    m.textContent = text;
    m.className = 'message show ' + type;
    clearTimeout(m._t);
    m._t = setTimeout(() => m.classList.remove('show'), 2200);
}

function updateBalance() {
    $('balance').textContent = fmt(user.balance);
    $('withdrawBtn').disabled = user.balance <= 0;
}

/* ---------- SOUND ---------- */
function ensureAudio() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (window.Music) {
        window.Music.init(audioCtx);
        if (!muted) window.Music.start();
    }
}

function tone(freq, dur, type, vol, delay) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
}

function beep() { ensureAudio(); tone(520, 0.08, 'square', 0.06); }
function chime() { ensureAudio(); tone(660, 0.12, 'sine', 0.1); tone(880, 0.18, 'sine', 0.1, 0.1); }
function crashSound() {
    ensureAudio();
    tone(120, 0.5, 'sawtooth', 0.12);
    tone(90, 0.6, 'square', 0.08, 0.05);
}

function toggleSound() {
    muted = !muted;
    localStorage.setItem(KEY.muted, muted ? '1' : '0');
    $('soundBtn').textContent = muted ? '🔇' : '🔊';
    if (window.Music) {
        if (muted) {
            window.Music.setMuted(true);
        } else {
            ensureAudio();
            window.Music.setMuted(false);
        }
    } else if (!muted) {
        ensureAudio();
    }
}

/* ---------- STARS & BACKGROUND ---------- */
function createStars() {
    const container = $('stars');
    for (let i = 0; i < 100; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 60 + '%';
        star.style.width = Math.random() * 3 + 1 + 'px';
        star.style.height = star.style.width;
        star.style.animationDelay = Math.random() * 2 + 's';
        container.appendChild(star);
    }
}

function createClouds() {
    const container = $('clouds');
    for (let i = 0; i < 5; i++) {
        const cloud = document.createElement('div');
        cloud.className = 'cloud';
        cloud.style.top = (54 + Math.random() * 28) + '%';
        cloud.style.left = (Math.random() * 90) + '%';
        cloud.style.animationDelay = (-Math.random() * 60) + 's';
        cloud.style.animationDuration = (45 + Math.random() * 45) + 's';
        cloud.style.opacity = (0.55 + Math.random() * 0.4).toFixed(2);
        container.appendChild(cloud);
    }
}

/* ---------- FLIGHT PATH GEOMETRY ---------- */
function getGameSize() {
    const a = $('gameArea');
    return { w: a.clientWidth, h: a.clientHeight };
}

function pathPos(mult) {
    const { w, h } = getGameSize();
    const t = 1 - Math.pow(2, -mult / 10);
    return {
        x: 60 + t * (w - 160),
        y: 90 + t * (h - 220),
        t: t
    };
}

function drawGuide() {
    const svg = $('flightSvg');
    const { w, h } = getGameSize();
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    const pts = [];
    for (let m = 1; m <= 30; m += 0.4) {
        const p = pathPos(m);
        pts.push(Math.round(p.x) + ',' + Math.round(h - p.y));
    }
    $('guideLine').setAttribute('points', pts.join(' '));
}

/* ---------- ROUND FLOW ---------- */
function generateCrashPoint() {
    const r = Math.random();
    if (r < 0.35) return 1 + Math.random() * 0.5;
    if (r < 0.65) return 1.5 + Math.random() * 1;
    if (r < 0.82) return 2.5 + Math.random() * 2;
    if (r < 0.92) return 4.5 + Math.random() * 5;
    if (r < 0.97) return 9.5 + Math.random() * 10;
    return 19.5 + Math.random() * 80;
}

function pickName() {
    const used = players.map(p => p.name);
    const pool = FAKE_NAMES.filter(n => !used.includes(n) && n !== user.name);
    const all = pool.length ? pool : FAKE_NAMES;
    return all[Math.floor(Math.random() * all.length)];
}

function generatePlayers() {
    const n = 2 + Math.floor(Math.random() * 6);
    players = [];
    for (let i = 0; i < n; i++) {
        players.push({
            name: pickName(),
            bet: Math.round((5 + Math.random() * 395) * 100) / 100,
            target: generateCrashPoint(),
            ride: Math.random() < 0.4,
            cashed: false
        });
    }
}

function totalPlayers() {
    return players.length + (betPlaced ? 1 : 0);
}

function totalBets() {
    let sum = players.reduce((s, p) => s + p.bet, 0);
    if (betPlaced) sum += currentBet;
    return sum;
}

function updateRoundInfo() {
    const el = $('roundInfo');
    if (gamePhase === 'betting') {
        el.innerHTML =
            '<span><span class="live-dot"></span> LIVE</span>' +
            '<span>⏱ Round starts in <b>' + countdown + '</b>s</span>' +
            '<span>👥 <b>' + totalPlayers() + '</b> players</span>' +
            '<span>🎟 Bets: <b>$' + fmt(totalBets()) + '</b></span>';
    } else if (gamePhase === 'flying') {
        el.innerHTML =
            '<span><span class="live-dot"></span> LIVE</span>' +
            '<span>👥 <b>' + totalPlayers() + '</b> players</span>' +
            '<span>🎟 Bets: <b>$' + fmt(totalBets()) + '</b></span>' +
            '<span>💰 Payout: <b>$' + fmt(totalPayout) + '</b></span>';
    } else if (gamePhase === 'crashed') {
        el.innerHTML = '<span>💥 Round crashed at <b>' + fmt(crashPoint) + 'x</b></span>';
    }
}

function updateMultiplierDisplay() {
    const d = $('multiplier');
    d.className = 'multiplier-display';
    if (gamePhase === 'flying') {
        d.textContent = multiplier.toFixed(2) + 'x';
        d.classList.add('flying');
    } else if (gamePhase === 'crashed') {
        d.textContent = crashPoint.toFixed(2) + 'x';
        d.classList.add('crashed');
    } else {
        d.textContent = countdown > 0 ? String(countdown) : '';
        d.classList.add('waiting');
    }
}

function updateRoundStatus() {
    const el = $('roundStatus');
    if (gamePhase === 'flying' && betPlaced) {
        const win = currentBet * multiplier;
        el.innerHTML = 'Your bet: <b>$' + fmt(currentBet) +
            '</b> @ <b>' + multiplier.toFixed(2) + 'x</b>' +
            (playerCashed ? ' — <span style="color:#4ecca3">cashed out! +$' + fmt(win) + '</span>'
                : ' — payout <b>$' + fmt(win) + '</b>');
    } else if (gamePhase === 'flying' && !betPlaced) {
        el.textContent = 'Watching this round… place a bet next round.';
    } else if (gamePhase === 'betting') {
        el.textContent = betPlaced
            ? 'Bet placed: $' + fmt(currentBet) + '. Waiting for takeoff…'
            : 'Waiting for the next round…';
    } else if (gamePhase === 'crashed') {
        el.textContent = betPlaced && !playerCashed
            ? 'Round lost: -$' + fmt(currentBet)
            : 'Round ended.';
    }
}

/* ---------- BETTING ---------- */
function placeBet() {
    if (gamePhase !== 'betting') {
        toast('Wait for the next round to place a bet', 'warn');
        return;
    }
    if (betPlaced) return;

    const bet = parseFloat($('betAmount').value);
    if (isNaN(bet) || bet <= 0) {
        toast('Enter a valid bet amount', 'error');
        return;
    }
    if (bet > user.balance) {
        toast('Insufficient balance! Request a deposit or withdraw less.', 'error');
        return;
    }

    currentBet = bet;
    user.balance -= bet;
    saveUser();
    updateBalance();

    betPlaced = true;
    $('betBtn').disabled = true;
    $('cancelBetBtn').disabled = false;
    $('betAmount').disabled = true;
    $('cashoutBtn').disabled = true;

    autoCashoutEnabled = $('autoCashoutCheck').checked;
    autoCashoutTarget = parseFloat($('autoCashoutValue').value) || 2.00;

    beep();
    updateRoundInfo();
    updateRoundStatus();
}

function cancelBet() {
    if (gamePhase !== 'betting' || !betPlaced) return;
    user.balance += currentBet;
    saveUser();
    updateBalance();

    currentBet = 0;
    betPlaced = false;
    $('betBtn').disabled = false;
    $('cancelBetBtn').disabled = true;
    $('betAmount').disabled = false;

    updateRoundInfo();
    updateRoundStatus();
}

/* ---------- ROUND LIFECYCLE ---------- */
function startBettingPhase() {
    gamePhase = 'betting';
    isFlying = false;
    betPlaced = false;
    currentBet = 0;
    playerCashed = false;
    totalPayout = 0;

    clearInterval(gameInterval);
    clearInterval(countdownInterval);

    $('chips').innerHTML = '';
    $('autoLine').style.display = 'none';

    const plane = $('plane');
    plane.style.left = '60px';
    plane.style.bottom = '90px';
    plane.querySelector('.plane').style.rotate = '-15deg';
    const jet = plane.querySelector('.jet');
    if (jet) jet.style.display = 'block';
    $('explosion').classList.remove('boom');

    generatePlayers();
    drawGuide();
    updateMultiplierDisplay();
    updateRoundStatus();

    countdown = 9 + Math.floor(Math.random() * 4);
    $('betBtn').disabled = false;
    $('cancelBetBtn').disabled = true;
    $('cashoutBtn').disabled = true;
    $('betAmount').disabled = false;

    if (window.Music) window.Music.setIntensity(0.45);

    updateRoundInfo();

    countdownInterval = setInterval(() => {
        countdown--;
        updateMultiplierDisplay();
        updateRoundInfo();
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            startFlight();
        }
    }, 1000);
}

function startFlight() {
    gamePhase = 'flying';
    isFlying = true;
    multiplier = 1.00;
    crashPoint = generateCrashPoint();
    totalPayout = 0;

    $('betBtn').disabled = true;
    $('cancelBetBtn').disabled = true;
    $('betAmount').disabled = true;
    $('cashoutBtn').disabled = !betPlaced;

    updateMultiplierDisplay();
    updateRoundStatus();

    if (window.Music) window.Music.setIntensity(1);

    gameInterval = setInterval(tick, 50);
}

function tick() {
    const inc = 0.015 + multiplier * 0.007;
    multiplier += inc;

    players.forEach(p => {
        if (p.cashed || p.ride) return;
        if (multiplier >= p.target && multiplier < crashPoint) {
            p.cashed = true;
            const pay = p.bet * p.target;
            totalPayout += pay;
            spawnChip(p.name, p.target, true);
            addFeed(p.name, pay, p.target);
        }
    });

    const pos = pathPos(multiplier);
    const plane = $('plane');
    plane.style.left = pos.x + 'px';
    plane.style.bottom = pos.y + 'px';
    plane.querySelector('.plane').style.rotate = (-15 + pos.t * 40) + 'deg';

    updateAutoLine();

    if (autoCashoutEnabled && betPlaced && !playerCashed && multiplier >= autoCashoutTarget) {
        cashOut();
        return;
    }

    if (multiplier >= crashPoint) {
        crash();
        return;
    }

    updateMultiplierDisplay();
    updateRoundInfo();
    updateRoundStatus();
}

function cashOut() {
    if (!betPlaced || !isFlying || playerCashed) return;
    playerCashed = true;

    const winnings = currentBet * multiplier;
    user.balance += winnings;
    saveUser();
    updateBalance();

    totalPayout += winnings;
    spawnChip(user.name, multiplier, false);
    addFeed(user.name, winnings, multiplier);

    chime();
    showMessage('Cashed Out! +$' + fmt(winnings), 'win-message');
    $('cashoutBtn').disabled = true;

    updateRoundStatus();
}

function crash() {
    clearInterval(gameInterval);
    isFlying = false;
    gamePhase = 'crashed';

    if (betPlaced && !playerCashed) {
        showMessage('CRASHED at ' + crashPoint.toFixed(2) + 'x! You lose $' + fmt(currentBet), 'lose-message');
    } else {
        showMessage('CRASHED at ' + crashPoint.toFixed(2) + 'x!', 'lose-message');
    }

    crashSound();
    addRound(crashPoint);
    createExplosion();
    addCrashMarker();

    $('cashoutBtn').disabled = true;
    updateMultiplierDisplay();
    updateRoundInfo();
    updateRoundStatus();

    if (window.Music) window.Music.setIntensity(0.15);

    setTimeout(() => startBettingPhase(), 3500);
}

/* ---------- CHIPS / EXPLOSION / FEED / ROUNDS ---------- */
function spawnChip(name, mult, isFake) {
    const pos = pathPos(mult);
    const chip = document.createElement('div');
    chip.className = 'chip' + (isFake ? '' : ' chip-self');
    chip.innerHTML = '<b>' + name + '</b><span>' + mult.toFixed(2) + 'x</span>';
    chip.style.left = pos.x + 'px';
    chip.style.bottom = pos.y + 'px';
    $('chips').appendChild(chip);
    setTimeout(() => chip.classList.add('show'), 20);
}

function addCrashMarker() {
    const pos = pathPos(crashPoint);
    const chip = document.createElement('div');
    chip.className = 'chip crash-chip';
    chip.innerHTML = '<b>💥 ' + crashPoint.toFixed(2) + 'x</b>';
    chip.style.left = pos.x + 'px';
    chip.style.bottom = pos.y + 'px';
    $('chips').appendChild(chip);
    setTimeout(() => chip.classList.add('show'), 20);
}

function updateAutoLine() {
    const line = $('autoLine');
    if (autoCashoutEnabled && betPlaced && !playerCashed && gamePhase === 'flying') {
        const pos = pathPos(autoCashoutTarget);
        line.style.display = 'block';
        line.style.left = pos.x + 'px';
        line.style.height = Math.max(0, pos.y - 80) + 'px';
    } else {
        line.style.display = 'none';
    }
}

function createExplosion() {
    const plane = $('plane');
    const rect = plane.getBoundingClientRect();
    const area = $('gameArea');
    const areaRect = area.getBoundingClientRect();

    for (let i = 0; i < 24; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = (rect.left - areaRect.left) + 'px';
        particle.style.top = (rect.top - areaRect.top) + 'px';
        particle.style.animationDelay = (Math.random() * 0.4) + 's';

        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 60;
        particle.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
        particle.style.setProperty('--ty', Math.sin(angle) * dist + 'px');

        area.appendChild(particle);
        setTimeout(() => particle.remove(), 1100);
    }

    const jet = plane.querySelector('.jet');
    if (jet) jet.style.display = 'none';
    $('explosion').classList.add('boom');
}

function addFeed(name, amount, mult) {
    const feed = $('liveFeed');
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = '<span class="feed-name">' + name + '</span> cashed out <b>$' +
        fmt(amount) + '</b> @ <span class="feed-mult">' + mult.toFixed(2) + 'x</span>';
    feed.prepend(item);
    while (feed.children.length > 30) feed.lastChild.remove();
}

function addRound(c) {
    rounds.unshift(c);
    if (rounds.length > 50) rounds.pop();
    saveRounds();
    renderRounds();
}

function renderRounds() {
    const el = $('roundsList');
    el.innerHTML = '';
    rounds.forEach((c, i) => {
        const item = document.createElement('div');
        item.className = 'round-item';
        item.innerHTML = '<span>#' + (rounds.length - i) + '</span>' +
            '<span class="' + (c >= 2 ? 'high' : 'low') + '">' + c.toFixed(2) + 'x</span>';
        el.appendChild(item);
    });
}

function switchPanel(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $('panelLive').classList.toggle('hidden', tab !== 'live');
    $('panelHistory').classList.toggle('hidden', tab !== 'history');
}

/* ---------- PLAYER NAME ---------- */
function logout() {
    sessionStorage.removeItem('aviator_player_session');
    location.href = 'login.html';
}

function openNameModal() {
    $('nameInput').value = user.name;
    openModal('nameModal');
}

function saveName() {
    const name = $('nameInput').value.trim().slice(0, 16);
    if (!name) {
        toast('Please enter a name', 'error');
        return;
    }
    user.name = name;
    saveUser();
    $('playerNameLabel').textContent = user.name;
    closeModal('nameModal');
    toast('Welcome, ' + name + '!', 'success');
}

/* ---------- WALLET ---------- */
function openWallet(section) {
    renderWallet();
    openModal('walletModal');
    $('walletAmount').focus();
}

function pendingSums() {
    let pd = 0, pw = 0;
    getTx().forEach(t => {
        if (t.status !== 'pending') return;
        if (t.type === 'deposit') pd += t.amount;
        else pw += t.amount;
    });
    return { pd: pd, pw: pw };
}

function renderWallet() {
    $('walletBalance').textContent = '$' + fmt(user.balance);
    const sums = pendingSums();
    $('walletPendingDeposit').textContent = '$' + fmt(sums.pd);
    $('walletPendingWithdraw').textContent = '$' + fmt(sums.pw);

    const list = $('walletTxList');
    const tx = getTx().slice().reverse();
    list.innerHTML = '';
    if (!tx.length) {
        list.innerHTML = '<div class="empty-state">No transactions yet.</div>';
        return;
    }
    tx.slice(0, 12).forEach(t => {
        const item = document.createElement('div');
        item.className = 'tx-item';
        item.innerHTML =
            '<div class="tx-meta">' +
            '<span>' + (t.type === 'deposit' ? '💵 Deposit' : '🏧 Withdrawal') + ' ' +
            '<span class="badge ' + t.status + '">' + t.status + '</span></span>' +
            '<span class="tx-date">' + fmtDate(t.date) + '</span></div>' +
            '<span class="tx-amount ' + t.type + '">' + (t.type === 'deposit' ? '+' : '-') + '$' + fmt(t.amount) + '</span>';
        list.appendChild(item);
    });
}

function requestDeposit() {
    const amount = parseFloat($('walletAmount').value);
    if (isNaN(amount) || amount <= 0) {
        toast('Enter a valid deposit amount', 'error');
        return;
    }
    const tx = getTx();
    tx.unshift({
        id: 'tx' + Date.now() + '-' + Math.floor(Math.random() * 9999),
        player: user.name,
        type: 'deposit',
        amount: Math.round(amount * 100) / 100,
        status: 'pending',
        date: new Date().toISOString()
    });
    saveTx(tx);
    renderWallet();
    $('walletAmount').value = '';
    toast('Deposit request submitted! Waiting for admin approval…', 'success');
    beep();
}

function requestWithdraw() {
    const amount = parseFloat($('walletAmount').value);
    if (isNaN(amount) || amount <= 0) {
        toast('Enter a valid withdrawal amount', 'error');
        return;
    }
    if (amount > user.balance) {
        toast('Insufficient balance for withdrawal', 'error');
        return;
    }

    user.balance -= amount;
    saveUser();
    updateBalance();

    const tx = getTx();
    tx.unshift({
        id: 'tx' + Date.now() + '-' + Math.floor(Math.random() * 9999),
        player: user.name,
        type: 'withdraw',
        amount: Math.round(amount * 100) / 100,
        status: 'pending',
        date: new Date().toISOString()
    });
    saveTx(tx);
    renderWallet();
    $('walletAmount').value = '';
    toast('Withdrawal request submitted! Funds are on hold pending approval.', 'warn');
    beep();
}

/* ---------- CROSS-TAB SYNC (admin approvals update the game live) ---------- */
window.addEventListener('storage', (e) => {
    if (e.key === KEY.user) {
        loadUser();
        updateBalance();
        $('playerNameLabel').textContent = user.name;
        if ($('walletModal').classList.contains('open')) renderWallet();
    }
    if (e.key === KEY.tx) {
        if ($('walletModal').classList.contains('open')) renderWallet();
    }
});

/* ---------- INIT ---------- */
function init() {
    if (sessionStorage.getItem('aviator_player_session') !== '1') {
        location.href = 'login.html';
        return;
    }

    muted = localStorage.getItem(KEY.muted) === '1';
    $('soundBtn').textContent = muted ? '🔇' : '🔊';

    const isNewUser = !localStorage.getItem(KEY.user);

    loadUser();
    $('playerNameLabel').textContent = user.name;

    try { rounds = JSON.parse(localStorage.getItem(KEY.rounds) || '[]'); } catch (e) { rounds = []; }

    createStars();
    createClouds();
    drawGuide();
    updateBalance();
    renderRounds();
    updateMultiplierDisplay();
    updateRoundStatus();

    if (isNewUser) {
        openNameModal();
        setTimeout(() => $('nameInput').focus(), 100);
    }
    startBettingPhase();

    window.addEventListener('resize', drawGuide);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && $('nameModal').classList.contains('open')) saveName();
        if (e.key === 'Escape') ['nameModal', 'walletModal'].forEach(id => closeModal(id));
    });

    document.addEventListener('pointerdown', function firstInteraction() {
        ensureAudio();
        document.removeEventListener('pointerdown', firstInteraction);
    });
}

init();
