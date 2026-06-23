/* =====================================================
   AERO FINANCE — app.js  v3.0  (Full Feature Build)
   Principal Engineer: Antigravity AI
   ===================================================== */

// ── Global State ────────────────────────────────────────
const state = {
    user: null,
    transactions: [],
    bills: [],
    goals: [],
    budgets: [],
    streak: 0,
    badges: []
};

let currentView   = 'landing';
let ws            = null;
let currentTxType = 'expense';
let debtStrategy  = 'avalanche'; // 'avalanche' | 'snowball'
let authMode      = 'signup';

// DOM refs (populated on DOMContentLoaded)
let navLoginBtn, navSignupBtn, authModal, authStep1, authStep2,
    verifyBtn, verifyText, verifySpinner, authBackBtn,
    appContainer, txModal, txForm, closeTxBtn, txTypeIncome, txTypeExpense,
    goalModal;

// ── Scroll Reveal System ──────────────────────────────────
const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0) scale(1)';
                entry.target.style.filter = 'blur(0)';
            }, index * 60);
            scrollObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

function applyScrollAnimations() {
    document.querySelectorAll('.dashboard-card, .metric-card, chart-container, section, .scroll-reveal').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px) scale(0.98)';
        card.style.filter = 'blur(5px)';
        card.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), filter 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
        scrollObserver.observe(card);
    });
}

// ── Typographic Character Splitting ──────────────────────
// Wraps each character in a <span> with a staggered CSS --i variable
// so the `revealCharAnim` keyframe in style.css staggers the entrance.
function splitChars(el) {
    if (!el || el.dataset.charSplit === 'done') return;
    const text = el.textContent;
    el.textContent = '';
    el.dataset.charSplit = 'done';
    let i = 0;
    for (const ch of text) {
        const span = document.createElement('span');
        span.className = 'reveal-char';
        span.style.setProperty('--i', i);
        span.textContent = ch === ' ' ? '\u00A0' : ch; // preserve spaces
        el.appendChild(span);
        i++;
    }
}

// ── Atmospheric Glow Orbs ─────────────────────────────────
// Injects two hardware-accelerated radial gradient orbs into the
// given container for cinematic ambient light morphing effects.
function injectAtmosphericOrbs(container) {
    if (!container || container.querySelector('.atmospheric-glow')) return;
    container.style.position = 'relative';
    container.style.overflow = 'hidden';

    const orb1 = document.createElement('div');
    orb1.className = 'atmospheric-glow';
    orb1.style.cssText = 'top:-60px;left:-80px;transform:translate3d(0,0,0);';

    const orb2 = document.createElement('div');
    orb2.className = 'atmospheric-glow-alt';
    orb2.style.cssText = 'bottom:-80px;right:-60px;transform:translate3d(0,0,0);';

    container.insertBefore(orb1, container.firstChild);
    container.appendChild(orb2);
}

// ── Toast System ────────────────────────────────────────
function toast(msg, type = 'success', duration = 3500) {
    let container = document.getElementById('aero-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'aero-toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const t = document.createElement('div');
    t.className = `aero-toast ${type}`;
    t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => t.remove(), 300);
    }, duration);
}

// ── WebSocket ────────────────────────────────────────────
function connectWebSocket() {
    const token = localStorage.getItem('aero_token');
    if (!token) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (ws) ws.close();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/api/ws?token=${token}`);
    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.event === 'state_update') {
                await fetchUserData();
                reRenderCurrentView();
                // Neon-flash all primary stat widgets after re-render
                requestAnimationFrame(() => {
                    document.querySelectorAll('.ws-flash-target').forEach(el => {
                        el.classList.remove('neon-flash-active');
                        void el.offsetWidth; // force reflow
                        el.classList.add('neon-flash-active');
                        el.addEventListener('animationend', () => el.classList.remove('neon-flash-active'), { once: true });
                    });
                });
            } else if (data.event === 'velocity_alert') {
                toast('⚡ ' + (data.message || 'Anomalous spending velocity detected!'), 'warning', 6000);
                // Show persistent banner if it doesn't exist yet
                let banner = document.getElementById('velocityBanner');
                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = 'velocityBanner';
                    banner.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-3 px-5 py-3 rounded-xl border border-yellow-400/50 bg-yellow-400/10 backdrop-blur text-yellow-300 text-sm font-semibold shadow-2xl';
                    banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span id="velocityBannerMsg"></span><button onclick="document.getElementById('velocityBanner').remove()" class="ml-4 text-yellow-400/60 hover:text-yellow-300 transition"><i class="fas fa-times"></i></button>`;
                    document.body.appendChild(banner);
                }
                document.getElementById('velocityBannerMsg').textContent = data.message || 'Anomalous spending velocity!';
                setTimeout(() => { const b = document.getElementById('velocityBanner'); if (b) b.remove(); }, 12000);
            }
        } catch (e) { /* silent */ }
    };
    ws.onclose = () => {
        if (localStorage.getItem('aero_token')) setTimeout(connectWebSocket, 3000);
    };
}

function reRenderCurrentView() {
    if (currentView === 'dashboard')    renderDashboardView();
    else if (currentView === 'transactions') renderTransactionsView();
    else if (currentView === 'budgeting')    renderBudgetingView();
    else if (currentView === 'bills')        renderBillsView();
    else if (currentView === 'goals')        renderGoalsView();
}

// ── Currency Formatter ───────────────────────────────────
function formatCurrency(amount) {
    if (!state.user) return `$${parseFloat(amount).toFixed(2)}`;
    const locales = { 'USD':'en-US', 'GBP':'en-GB', 'EUR':'de-DE', 'INR':'en-IN', 'JPY':'ja-JP' };
    return new Intl.NumberFormat(locales[state.user.currencyCode] || 'en-US', {
        style: 'currency', currency: state.user.currencyCode || 'USD'
    }).format(amount);
}

// ── Safe-to-Spend Calculation ────────────────────────────
function calcSafeToSpend() {
    const balance        = state.user?.balance || 0;
    const activeBills    = state.bills.filter(b => b.status !== 'cancellation_pending').reduce((s, b) => s + b.amount, 0);
    const goalContribs   = state.goals.reduce((s, g) => s + Math.max(0, (g.target - g.current) / 12), 0);
    const raw = balance - (activeBills + goalContribs);
    return Math.max(raw, 0);
}

function calcRawSafeToSpend() {
    const balance       = state.user?.balance || 0;
    const activeBills   = state.bills.filter(b => b.status !== 'cancellation_pending').reduce((s, b) => s + b.amount, 0);
    const goalContribs  = state.goals.reduce((s, g) => s + Math.max(0, (g.target - g.current) / 12), 0);
    return balance - (activeBills + goalContribs);
}

// Surplus: cash left after bills, monthly budget total, and $500 baseline buffer
function calcSweepSurplus() {
    const balance   = state.user?.balance || 0;
    const bills     = state.bills.reduce((s, b) => s + b.amount, 0);
    const budgeted  = state.budgets.reduce((s, b) => s + b.limit, 0);
    const buffer    = 500;
    return balance - bills - budgeted - buffer;
}

// ── Burnout Tracker ──────────────────────────────────────
function calcBurnoutMonths() {
    if (!state.transactions.length) return 0;
    const today = new Date();
    const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);
    const recentExpenses = state.transactions
        .filter(t => t.type === 'expense' && new Date(t.date) >= thirtyDaysAgo)
        .reduce((s, t) => s + t.amount, 0);
    const velocity = recentExpenses / 30; // daily spend
    if (velocity <= 0) return 99;
    const liquid = state.user?.balance || 0;
    return Math.round((liquid / velocity / 30) * 10) / 10;
}

// ── Emergency Reserve Target ─────────────────────────────
function calcEmergencyReserve() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);
    const monthly = state.transactions
        .filter(t => t.type === 'expense' && new Date(t.date) >= thirtyDaysAgo)
        .reduce((s, t) => s + t.amount, 0);
    return Math.round(monthly * 3 * 100) / 100; // 3x monthly expenses
}

// ── Mock Transactions Generator ──────────────────────────
function generateMockTransactions() {
    const categories = ['Dining','Shopping','Groceries','Utilities','Entertainment','Salary'];
    const descs = {
        'Dining':['Sushi Bistro','Starbucks','Pizza Palace','Thai Garden','Burger Joint'],
        'Shopping':['Amazon','Apple Store','Nike','IKEA','Zara'],
        'Groceries':['Whole Foods',"Trader Joe's",'Costco','Walmart','Kroger'],
        'Utilities':['Electric Bill','Water Bill','Internet','Gas Bill','Phone Bill'],
        'Entertainment':['Netflix','Spotify','Cinema Ticket','Steam Games','Concert'],
        'Salary':['Monthly Salary','Freelance Payment','Bonus','Dividend','Consulting Fee']
    };
    const txs = [];
    const today = new Date();
    for (let i = 59; i >= 0; i--) {
        const date = new Date(today); date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const count = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < count; j++) {
            const isSalary = (i === 59 || i === 29 || i === 14) && j === 0;
            const cat = isSalary ? 'Salary' : categories[Math.floor(Math.random() * (categories.length - 1))];
            const desc = descs[cat][Math.floor(Math.random() * descs[cat].length)];
            const type = cat === 'Salary' ? 'income' : 'expense';
            const amount = type === 'income'
                ? parseFloat((Math.random() * 2000 + 3000).toFixed(2))
                : parseFloat((Math.random() * 150 + 10).toFixed(2));
            txs.push({ id: txs.length + 1, date: dateStr, description: desc, category: cat, amount, type });
        }
    }
    return txs;
}

// ── Streak / Gamification ────────────────────────────────
function computeStreak() {
    // Count consecutive days with logged transactions
    const txDates = [...new Set(state.transactions.map(t => t.date))].sort().reverse();
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let check = today;
    for (const d of txDates) {
        if (d === check) { streak++; const dt = new Date(check); dt.setDate(dt.getDate() - 1); check = dt.toISOString().split('T')[0]; }
        else if (d < check) break;
    }
    return streak;
}

function getBadges(streak, totalTx) {
    const badges = [];
    if (streak >= 7)  badges.push({ label: '7-Day Streak',  icon: 'fa-fire',        cls: 'gold' });
    if (streak >= 30) badges.push({ label: '30-Day Streak', icon: 'fa-crown',        cls: 'platinum' });
    if (totalTx >= 50) badges.push({ label: 'Power Logger', icon: 'fa-bolt',         cls: 'neon' });
    if (totalTx >= 10) badges.push({ label: 'First Entries', icon: 'fa-star',        cls: 'gold' });
    if (state.goals.length >= 3) badges.push({ label: 'Goal Setter', icon: 'fa-bullseye', cls: 'neon' });
    return badges;
}

// ── Sidebar Component ────────────────────────────────────
function sidebar(active) {
    const items = [
        { key: 'dashboard',    label: 'Dashboard',     icon: 'fa-home',               fn: 'renderDashboardView()' },
        { key: 'transactions', label: 'Transactions',  icon: 'fa-list',               fn: 'renderTransactionsView()' },
        { key: 'budgeting',    label: 'Budgeting',     icon: 'fa-chart-pie',          fn: 'renderBudgetingView()' },
        { key: 'bills',        label: 'Bills & Subs',  icon: 'fa-file-invoice-dollar',fn: 'renderBillsView()' },
        { key: 'goals',        label: 'Goals',         icon: 'fa-bullseye',           fn: 'renderGoalsView()' },
    ];
    const welcome = active === 'dashboard' ? `<div class="mb-10"><p class="text-sm text-gray-500">Welcome back,</p><p class="text-xl font-bold text-white">${state.user?.name || ''}</p></div>` : '';
    const nav = items.map(it => {
        const isActive = it.key === active;
        return `<button onclick="${it.fn}" class="w-full text-left p-3 rounded ${isActive ? 'bg-dark border border-neon text-neon' : 'hover:bg-dark text-gray-400 hover:text-white'} flex items-center space-x-3 transition">
            <i class="fas ${it.icon} w-5"></i> <span>${it.label}</span>
        </button>`;
    }).join('');
    const footer = `<div class="mt-auto pt-6 border-t border-gray-800 space-y-2">
        <button onclick="openTxModal()" class="w-full bg-neon text-black p-3 rounded font-bold hover:brightness-110 flex items-center justify-center space-x-2 transition neon-box-glow">
            <i class="fas fa-plus"></i> <span>New Log Entry</span>
        </button>
        <button onclick="logout()" class="w-full text-left p-3 rounded hover:bg-red-900/20 text-gray-500 hover:text-red-400 flex items-center space-x-3 transition">
            <i class="fas fa-sign-out-alt"></i> <span>Terminate Session</span>
        </button>
    </div>`;
    return `<aside class="w-64 bg-darker border-r border-gray-800 p-6 flex flex-col hidden md:flex">${welcome}<nav class="space-y-2 flex-grow">${nav}</nav>${footer}</aside>`;
}

// ── Initialization ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    navLoginBtn    = document.getElementById('navLoginBtn');
    navSignupBtn   = document.getElementById('navSignupBtn');
    authModal      = document.getElementById('authModal');
    authStep1      = document.getElementById('authStep1');
    authStep2      = document.getElementById('authStep2');
    verifyBtn      = document.getElementById('authVerifyBtn');
    verifyText     = document.getElementById('verifyText');
    verifySpinner  = document.getElementById('verifySpinner');
    authBackBtn    = document.getElementById('authBackBtn');
    appContainer   = document.getElementById('app-container');
    txModal        = document.getElementById('txModal');
    txForm         = document.getElementById('txForm');
    closeTxBtn     = document.getElementById('closeTxBtn');
    txTypeIncome   = document.getElementById('txTypeIncome');
    txTypeExpense  = document.getElementById('txTypeExpense');

    const token = localStorage.getItem('aero_token');
    if (token) {
        await fetchUserData();
        connectWebSocket();
        renderDashboardView();
    } else {
        renderLandingView();
    }
    setupEventListeners();
    setupVoiceNavigation();
    updateNav();
    splitChars(document.querySelector('nav h1'));
});

// ── Auth & Nav ───────────────────────────────────────────
function logout() {
    localStorage.removeItem('aero_token');
    if (ws) { ws.close(); ws = null; }
    state.user = null; state.transactions = []; state.goals = [];
    state.bills = []; state.budgets = [];
    updateNav();
    renderLandingView();
    toast('Session terminated.', 'info');
}

function updateNav() {
    const guestActions  = document.getElementById('navGuestActions');
    const userActions   = document.getElementById('navUserActions');
    const userNameDisplay = document.getElementById('navUserName');
    const fab = document.getElementById('aeroFAB');
    if (state.user) {
        guestActions.classList.add('hidden'); guestActions.classList.remove('md:flex');
        userActions.classList.remove('hidden'); userActions.classList.add('md:flex');
        userNameDisplay.textContent = state.user.name;
        if (fab) fab.classList.remove('hidden');
    } else {
        userActions.classList.add('hidden'); userActions.classList.remove('md:flex');
        guestActions.classList.remove('hidden'); guestActions.classList.add('md:flex');
        if (fab) fab.classList.add('hidden');
    }
}

async function fetchUserData() {
    const token = localStorage.getItem('aero_token');
    if (!token) return;
    try {
        const res = await fetch('/api/user/data', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const data = await res.json();
            state.user     = data.user;
            state.transactions = data.transactions?.length > 0 ? data.transactions : generateMockTransactions();
            state.goals    = data.goals?.length > 0 ? data.goals : [];
            state.budgets  = data.budgets?.length > 0 ? data.budgets : [];
            state.bills    = data.bills?.length > 0 ? data.bills : [];
            // Auto-create Emergency Fund goal if no goals exist
            if (!state.goals.length) {
                const target = calcEmergencyReserve() || 5000;
                try {
                    const tk = localStorage.getItem('aero_token');
                    await fetch('/api/user/goal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tk}` },
                        body: JSON.stringify({ name: 'Emergency Fund', target, color: '#3b82f6', priority: 1, current: 0 })
                    });
                    const r2 = await fetch('/api/user/data', { headers: { 'Authorization': `Bearer ${tk}` } });
                    if (r2.ok) { const d2 = await r2.json(); state.goals = d2.goals || []; }
                } catch(e) { /* silent */ }
            }
            updateNav();
        } else {
            localStorage.removeItem('aero_token');
            updateNav(); renderLandingView();
        }
    } catch (e) { console.error('Auth sync error', e); }
}

// ── Voice Navigation ─────────────────────────────────────
function setupVoiceNavigation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true; recognition.lang = 'en-US';
    recognition.onresult = (event) => {
        const transcript = event.results[event.resultIndex][0].transcript.toLowerCase();
        const vi = document.getElementById('voiceIndicator');
        const vs = document.getElementById('voiceStatus');
        if (transcript.includes('aero')) {
            if (vi) { vi.classList.remove('hidden'); setTimeout(() => vi.classList.add('hidden'), 3000); }
            if (vs) vs.textContent = `"${transcript}"`;
            // Navigation
            if (transcript.includes('dashboard') || transcript.includes('command center')) renderDashboardView();
            else if (transcript.includes('transaction') || transcript.includes('ledger')) renderTransactionsView();
            else if (transcript.includes('budget') || transcript.includes('resource')) renderBudgetingView();
            else if (transcript.includes('bill') || transcript.includes('subscription')) renderBillsView();
            else if (transcript.includes('goal') || transcript.includes('future vector')) renderGoalsView();
            // Autonomous commands
            else if (transcript.includes('auto sweep') || transcript.includes('execute sweep')) {
                const surplus = calcSweepSurplus();
                if (surplus > 0) executeSweep(surplus);
                else toast('Insufficient surplus for sweep.', 'warning');
            }
            // Chat queries
            else {
                openChatPanel();
                setTimeout(() => {
                    const inp = document.getElementById('chatInput');
                    if (inp) { inp.value = transcript; sendChatMessage(); }
                }, 300);
            }
        }
    };
    try { recognition.start(); } catch(e) { /* mic not available */ }
}

// ── Event Listeners ──────────────────────────────────────
function setupEventListeners() {
    navSignupBtn.addEventListener('click', () => { authMode = 'signup'; updateAuthUI(); openAuthModal(); });
    navLoginBtn.addEventListener('click',  () => { authMode = 'login';  updateAuthUI(); openAuthModal(); });

    const mobileMenuBtn     = document.getElementById('mobileMenuBtn');
    const mobileMenu        = document.getElementById('mobileMenu');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('-translate-x-full');
            mobileMenuOverlay.classList.toggle('hidden');
        });
        mobileMenuOverlay.addEventListener('click', () => {
            mobileMenu.classList.add('-translate-x-full');
            mobileMenuOverlay.classList.add('hidden');
        });
    }

    const tabSignup         = document.getElementById('tabSignup');
    const tabLogin          = document.getElementById('tabLogin');
    const signupFields      = document.getElementById('signupFields');
    const loginFields       = document.getElementById('loginFields');
    const signupOnlyFields  = document.getElementById('signupOnlyFields');
    const authNextBtn       = document.getElementById('authNextBtn');

    function updateAuthUI() {
        if (authMode === 'signup') {
            tabSignup.className = 'flex-1 py-2 text-neon border-b-2 border-neon font-bold';
            tabLogin.className  = 'flex-1 py-2 text-gray-500 hover:text-white transition';
            signupFields.classList.remove('hidden'); loginFields.classList.add('hidden');
            signupOnlyFields.classList.remove('hidden');
            authNextBtn.textContent = 'Next Step'; verifyText.textContent = 'Verify Identity';
        } else {
            tabLogin.className  = 'flex-1 py-2 text-neon border-b-2 border-neon font-bold';
            tabSignup.className = 'flex-1 py-2 text-gray-500 hover:text-white transition';
            signupFields.classList.add('hidden'); loginFields.classList.remove('hidden');
            signupOnlyFields.classList.add('hidden');
            authNextBtn.textContent = 'Continue to Vault'; verifyText.textContent = 'Enter Archive';
        }
    }
    // expose for btn onclick calls
    window.updateAuthUI = updateAuthUI;

    tabSignup.addEventListener('click', () => { authMode = 'signup'; updateAuthUI(); });
    tabLogin.addEventListener('click',  () => { authMode = 'login';  updateAuthUI(); });

    authStep1.addEventListener('submit', (e) => {
        e.preventDefault();
        authStep1.classList.add('hidden'); authStep2.classList.remove('hidden');
    });
    authBackBtn.addEventListener('click', () => {
        authStep2.classList.add('hidden'); authStep1.classList.remove('hidden');
    });

    authStep2.addEventListener('submit', async (e) => {
        e.preventDefault();
        verifyText.classList.add('hidden'); verifySpinner.classList.remove('hidden'); verifyBtn.disabled = true;
        const accountNum = document.getElementById('authAccount').value;
        const password   = document.getElementById('authPassword').value;
        try {
            if (authMode === 'signup') {
                const signupData = {
                    name:          document.getElementById('authName').value,
                    age:           parseInt(document.getElementById('authAge').value),
                    nationality:   document.getElementById('authNationality').value,
                    bank:          document.getElementById('authBank').value,
                    accountNumber: accountNum,
                    password:      password,
                    crNumber:      document.getElementById('authCR').value
                };
                // Simulate 2000ms secure handshake
                await new Promise(r => setTimeout(r, 2000));
                const res = await fetch('/api/auth/signup', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(signupData)
                });
                if (!res.ok) throw new Error(await res.text());
                authMode = 'login'; authStep2.dispatchEvent(new Event('submit')); return;
            } else {
                const formData = new FormData();
                formData.append('username', accountNum); formData.append('password', password);
                const res = await fetch('/api/auth/login', { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Invalid credentials');
                const data = await res.json();
                localStorage.setItem('aero_token', data.access_token);
                await fetchUserData(); connectWebSocket();
                closeAuthModal(); updateNav(); renderDashboardView();
                toast(`Welcome back, ${state.user?.name?.split(' ')[0] || ''}!`, 'success');
            }
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            verifyText.classList.remove('hidden'); verifySpinner.classList.add('hidden'); verifyBtn.disabled = false;
        }
    });

    // Transaction Modal
    txTypeIncome.addEventListener('click', () => {
        currentTxType = 'income';
        txTypeIncome.className  = 'flex-1 py-2 rounded bg-dark border border-neon text-neon font-bold transition';
        txTypeExpense.className = 'flex-1 py-2 rounded bg-dark border border-gray-700 text-gray-400 transition';
    });
    txTypeExpense.addEventListener('click', () => {
        currentTxType = 'expense';
        txTypeExpense.className = 'flex-1 py-2 rounded bg-dark border border-neon text-neon font-bold transition';
        txTypeIncome.className  = 'flex-1 py-2 rounded bg-dark border border-gray-700 text-gray-400 transition';
    });
    closeTxBtn.addEventListener('click', closeTxModal);
    txForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('aero_token');
        const txData = {
            amount:      document.getElementById('txAmount').value,
            category:    document.getElementById('txCategory').value,
            description: document.getElementById('txDescription').value,
            type:        currentTxType
        };
        try {
            const res = await fetch('/api/user/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(txData)
            });
            if (res.ok) {
                await fetchUserData(); closeTxModal();
                toast(`${currentTxType === 'income' ? 'Income' : 'Expense'} logged: ${formatCurrency(txData.amount)}`, 'success');
                reRenderCurrentView();
            }
        } catch (err) { toast('Transaction failed.', 'error'); }
    });

    // ── Command Bar Keyboard Bindings ─────────────────────
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (!state.user) return; // only open when logged in
            const modal = document.getElementById('commandBarModal');
            if (modal && modal.classList.contains('hidden')) {
                openCommandBar();
            } else {
                closeCommandBar();
            }
        } else if (e.key === 'Escape') {
            const modal = document.getElementById('commandBarModal');
            if (modal && !modal.classList.contains('hidden')) {
                closeCommandBar();
            }
        }
    });
    // Enter key to execute inside the command bar input
    const cmdInput = document.getElementById('commandBarInput');
    if (cmdInput) cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') executeCommandBar(); });
    // Click outside command bar overlay to close
    const cmdModal = document.getElementById('commandBarModal');
    if (cmdModal) cmdModal.addEventListener('click', (e) => { if (e.target === cmdModal) closeCommandBar(); });
}

// ── Modal Helpers ────────────────────────────────────────
function openAuthModal()  { authModal.classList.remove('hidden'); setTimeout(() => authModal.classList.remove('opacity-0'), 10); }
function closeAuthModal() {
    authModal.classList.add('opacity-0');
    setTimeout(() => {
        authModal.classList.add('hidden');
        authStep1.reset(); authStep2.reset();
        authStep2.classList.add('hidden'); authStep1.classList.remove('hidden');
    }, 300);
}
function openTxModal()  { txModal.classList.remove('hidden'); setTimeout(() => txModal.classList.remove('opacity-0'), 10); }
function closeTxModal() {
    txModal.classList.add('opacity-0');
    setTimeout(() => { txModal.classList.add('hidden'); txForm.reset(); }, 300);
}

// ── Command Bar ──────────────────────────────────────────
function openCommandBar() {
    const modal = document.getElementById('commandBarModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.classList.add('opacity-100'); }, 10);
    const inp = document.getElementById('commandBarInput');
    if (inp) { inp.value = ''; inp.focus(); }
}

function closeCommandBar() {
    const modal = document.getElementById('commandBarModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.classList.remove('opacity-100');
    setTimeout(() => modal.classList.add('hidden'), 250);
}

function triggerCommandSuggestion(text) {
    const inp = document.getElementById('commandBarInput');
    if (inp) inp.value = text;
    executeCommandBar();
}

async function executeCommandBar() {
    const inp = document.getElementById('commandBarInput');
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    inp.disabled = true;
    const token = localStorage.getItem('aero_token');
    try {
        const res = await fetch('/api/command/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        closeCommandBar();
        toast(data.message || 'Command executed.', 'success', 4000);
        // Navigation
        if (data.target) {
            const navMap = {
                dashboard: renderDashboardView, transactions: renderTransactionsView,
                budgeting: renderBudgetingView, bills: renderBillsView, goals: renderGoalsView
            };
            const fn = navMap[data.target];
            if (fn) fn();
        } else if (data.action === 'TRANSACTION_MUTATION' || data.action === 'GOAL_MUTATION') {
            await fetchUserData();
            reRenderCurrentView();
        }
    } catch (e) {
        toast('Command failed. Check your connection.', 'error');
        closeCommandBar();
    } finally {
        if (inp) inp.disabled = false;
    }
}

// ── Goal Modal ───────────────────────────────────────────
function openGoalModal() {
    let m = document.getElementById('goalModal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'goalModal';
        m.className = 'fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center hidden opacity-0 transition-opacity duration-300';
        m.innerHTML = `
        <div class="bg-dark p-8 rounded-xl border border-gray-800 w-full max-w-md shadow-2xl relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-neon shadow-[0_0_15px_#14F195]"></div>
            <h2 class="text-2xl font-bold mb-6">New Goal Vector</h2>
            <form id="goalForm" class="space-y-4">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Goal Name</label>
                    <input type="text" id="goalName" placeholder="e.g., Emergency Fund" class="w-full bg-darker border border-gray-700 rounded p-2 text-white focus:border-neon focus:outline-none" required>
                </div>
                <div class="flex space-x-4">
                    <div class="flex-1">
                        <label class="block text-sm text-gray-400 mb-1">Target Amount</label>
                        <input type="number" id="goalTarget" step="0.01" class="w-full bg-darker border border-gray-700 rounded p-2 text-white focus:border-neon focus:outline-none" required>
                    </div>
                    <div class="flex-1">
                        <label class="block text-sm text-gray-400 mb-1">Starting Amount</label>
                        <input type="number" id="goalCurrent" step="0.01" value="0" class="w-full bg-darker border border-gray-700 rounded p-2 text-white focus:border-neon focus:outline-none">
                    </div>
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Color Tag</label>
                    <div class="flex space-x-3 mt-1" id="goalColorPicker">
                        ${['#14F195','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899'].map(c => `
                            <div onclick="selectGoalColor('${c}')" data-color="${c}" class="goal-color-swatch w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition" style="background:${c}"></div>
                        `).join('')}
                    </div>
                    <input type="hidden" id="goalColor" value="#14F195">
                </div>
                <button type="submit" class="w-full mt-6 bg-neon text-black py-2 rounded font-bold hover:brightness-110 transition neon-box-glow">Launch Goal</button>
                <button type="button" onclick="closeGoalModal()" class="w-full mt-2 text-gray-500 text-sm hover:text-white transition">Cancel</button>
            </form>
        </div>`;
        document.body.appendChild(m);
        m.querySelector('#goalForm').addEventListener('submit', submitGoal);
        // select first color by default
        selectGoalColor('#14F195');
    }
    m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
}

function selectGoalColor(c) {
    document.getElementById('goalColor').value = c;
    document.querySelectorAll('.goal-color-swatch').forEach(s => {
        s.style.borderColor = s.dataset.color === c ? '#fff' : 'transparent';
    });
}

function closeGoalModal() {
    const m = document.getElementById('goalModal');
    if (!m) return;
    m.classList.add('opacity-0');
    setTimeout(() => { m.classList.add('hidden'); m.querySelector('#goalForm')?.reset(); selectGoalColor('#14F195'); }, 300);
}

async function submitGoal(e) {
    e.preventDefault();
    const token = localStorage.getItem('aero_token');
    const payload = {
        name:     document.getElementById('goalName').value,
        target:   parseFloat(document.getElementById('goalTarget').value),
        current:  parseFloat(document.getElementById('goalCurrent').value) || 0,
        color:    document.getElementById('goalColor').value,
        priority: state.goals.length + 1
    };
    try {
        const res = await fetch('/api/user/goal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            await fetchUserData();
            closeGoalModal();
            toast(`Goal "${payload.name}" launched!`, 'success');
            renderGoalsView();
        }
    } catch(e) { toast('Failed to create goal.', 'error'); }
}

async function removeGoal(id) {
    if (!confirm('Terminate this goal vector?')) return;
    const token = localStorage.getItem('aero_token');
    try {
        const res = await fetch('/api/user/goal/' + id, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            await fetchUserData(); renderGoalsView();
            toast('Goal removed.', 'info');
        }
    } catch(e) { toast('Failed to remove goal.', 'error'); }
}

// ── NLP Search Engine ────────────────────────────────────
function applyNLPFilter(transactions, query) {
    if (!query.trim()) return transactions;
    const q = query.toLowerCase().trim();
    return transactions.filter(t => {
        // Negation: "NOT dining"
        const notMatch = q.match(/\bnot\s+([\w]+)/);
        if (notMatch) {
            const negTerm = notMatch[1];
            if (t.category.toLowerCase().includes(negTerm) || t.description.toLowerCase().includes(negTerm)) return false;
        }
        // Date: "last month", "last week", "last 3 weeks"
        const today = new Date();
        const txDate = new Date(t.date);
        const weeksMatch = q.match(/last\s+(\d+)\s+weeks?/);
        if (weeksMatch) {
            const weeks = parseInt(weeksMatch[1]);
            const cutoff = new Date(today); cutoff.setDate(today.getDate() - weeks * 7);
            if (txDate < cutoff) return false;
        } else if (q.includes('last month')) {
            const cutoff = new Date(today); cutoff.setMonth(today.getMonth() - 1);
            if (txDate < cutoff) return false;
        } else if (q.includes('last week')) {
            const cutoff = new Date(today); cutoff.setDate(today.getDate() - 7);
            if (txDate < cutoff) return false;
        } else if (q.includes('this month')) {
            if (txDate.getMonth() !== today.getMonth() || txDate.getFullYear() !== today.getFullYear()) return false;
        }
        // Month by name
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const mMatch = months.find(m => q.includes(m));
        if (mMatch) {
            const mi = months.indexOf(mMatch);
            if (txDate.getMonth() !== mi) return false;
        }
        // Amount: "over X", "above X", "under X", "below X", "between X and Y"
        const overMatch  = q.match(/(?:over|above|exceeding|greater than)\s+\$?(\d+(?:\.\d+)?)/);
        const underMatch = q.match(/(?:under|below|less than)\s+\$?(\d+(?:\.\d+)?)/);
        const betweenMatch = q.match(/between\s+\$?(\d+(?:\.\d+)?)\s+and\s+\$?(\d+(?:\.\d+)?)/);
        if (overMatch  && t.amount < parseFloat(overMatch[1]))  return false;
        if (underMatch && t.amount > parseFloat(underMatch[1])) return false;
        if (betweenMatch) {
            const lo = parseFloat(betweenMatch[1]), hi = parseFloat(betweenMatch[2]);
            if (t.amount < lo || t.amount > hi) return false;
        }
        // Type: "income", "expense", "purchases"
        if (q.includes('income') && t.type !== 'income') return false;
        if ((q.includes('expense') || q.includes('purchase')) && t.type !== 'expense') return false;
        // AND: "grocery AND over 50"
        const andParts = q.split(/\band\b/);
        for (const part of andParts) {
            const p = part.trim();
            if (!p || /(?:over|above|under|below|between|last|this|income|expense|purchase|not)\b/.test(p)) continue;
            const words = p.split(/\s+/).filter(w => w.length > 2 && !/^(\d+)$/.test(w));
            if (words.length && !words.some(w => t.description.toLowerCase().includes(w) || t.category.toLowerCase().includes(w))) return false;
        }
        // General keyword fallback
        const generalKeywords = q.replace(/(?:over|above|under|below|between|last|this|month|week|and|not|income|expense|purchase|greater|than|less|exceeding)\s*/g, '').replace(/\$?\d+(?:\.\d+)?/g, '').trim();
        if (generalKeywords && !t.description.toLowerCase().includes(generalKeywords) && !t.category.toLowerCase().includes(generalKeywords)) {
            // only fail if no special patterns matched
            const hasSpecial = overMatch || underMatch || betweenMatch || weeksMatch || mMatch || notMatch;
            if (!hasSpecial) return false;
        }
        return true;
    });
}

// ── Budget AI ────────────────────────────────────────────
async function runBudgetAI() {
    const token = localStorage.getItem('aero_token');
    const btn = document.getElementById('budgetAiBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> <span>Analyzing 6mo Data...</span>';
    try {
        const res = await fetch('/api/user/budget/recalculate', {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            Object.entries(data.suggested_budgets).forEach(([cat, limit]) => {
                const b = state.budgets.find(x => x.category === cat);
                if (b) b.limit = limit;
                else state.budgets.push({ category: cat, limit, spent: 0 });
            });
            renderBudgetingView();
            toast('Budget AI updated your limits!', 'success');
        }
    } catch (err) { toast('Budget AI offline.', 'error'); }
    finally {
        if (btn) btn.innerHTML = '<i class="fas fa-magic"></i> <span>One-Click Budget AI</span>';
    }
}

// ── Export Tax CSV ───────────────────────────────────────
function exportTaxCSV() {
    const DEDUCTIBLE_CATS = ['Utilities','Salary','Entertainment'];
    const rows = [['Date','Vendor','Amount','Category','Type','Is_Deductible']];
    state.transactions.forEach(t => {
        const deductible = DEDUCTIBLE_CATS.includes(t.category) && t.type === 'expense';
        rows.push([t.date, `"${t.description}"`, t.amount.toFixed(2), t.category, t.type, deductible ? 'TRUE' : 'FALSE']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'aero_tax_export.csv';
    a.click(); URL.revokeObjectURL(url);
    toast('Tax CSV exported!', 'success');
}

// ── Auto-Sweep Engine ────────────────────────────────────
async function executeSweep(amount) {
    const surplus = calcSweepSurplus();
    if (surplus <= 0) { toast('No sweepable surplus (need >$500 buffer).', 'warning'); return; }
    const sweepAmt = Math.min(amount, surplus);
    const token = localStorage.getItem('aero_token');
    try {
        const res = await fetch('/api/user/sweep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ amount: sweepAmt })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            state.user.balance = data.balance;
            state.user.hysa_balance = data.hysa_balance;
            if (currentView === 'dashboard') {
                renderDashboardView();
            } else if (currentView === 'goals') {
                renderGoalsView();
            }
            toast(`${formatCurrency(sweepAmt)} swept to virtual HYSA!`, 'success');
        } else {
            toast('Sweep failed: ' + (data.detail || 'server error'), 'error');
        }
    } catch(e) {
        toast('Sweep failed.', 'error');
    }
}

// ── Subscription Cancel (Simulation) ────────────────────
function cancelSubscription(name) {
    const bill = state.bills.find(b => b.name === name);
    if (!bill) return;
    bill.status = 'cancellation_pending';
    toast(`Cancellation requested for ${name}. Processing in 3–5 days.`, 'warning');
    renderBillsView();
}

// ── Overhead Calendar ────────────────────────────────────
function buildCalendar() {
    const today = new Date();
    const year  = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    // Build bill map: day -> bill names
    const billMap = {};
    state.bills.forEach(b => {
        const day = parseInt(b.date);
        if (!isNaN(day)) { if (!billMap[day]) billMap[day] = []; billMap[day].push(b.name); }
    });

    let html = `<div class="mb-3 text-center font-bold text-neon">${monthNames[month]} ${year}</div>`;
    html += `<div class="cal-grid mb-1">${dayNames.map(d => `<div class="cal-header">${d}</div>`).join('')}</div>`;
    html += `<div class="cal-grid">`;
    // Empty leading days
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === today.getDate();
        const hasBill = !!billMap[d];
        let cls = 'cal-day';
        if (isToday) cls += ' today';
        if (hasBill) cls += ' has-bill';
        const title = hasBill ? billMap[d].join(', ') : '';
        const onclick = hasBill ? `onclick="toast('Due: ${title}', 'warning')"` : '';
        html += `<div class="${cls}" title="${title}" ${onclick}>${d}</div>`;
    }
    html += `</div>`;
    return html;
}

// ── Debt Avalanche / Snowball ────────────────────────────
function getDebtList() {
    // Simulate debts from bills + any negative balances
    return [
        { name: 'Credit Card A', balance: 4200, rate: 22.9, minPay: 85 },
        { name: 'Student Loan',  balance: 18000, rate: 5.5,  minPay: 200 },
        { name: 'Car Loan',      balance: 8500, rate: 7.2,  minPay: 175 },
    ];
}

function renderDebtOptimizer(containerId) {
    const debts = getDebtList();
    const sorted = debtStrategy === 'avalanche'
        ? [...debts].sort((a,b) => b.rate - a.rate)
        : [...debts].sort((a,b) => a.balance - b.balance);
    const totalDebt = debts.reduce((s,d) => s + d.balance, 0);
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">Debt Optimizer</h3>
            <div class="strategy-toggle">
                <button id="debtAvalBtn" onclick="setDebtStrategy('avalanche')" class="${debtStrategy==='avalanche'?'active':''}">Avalanche</button>
                <button id="debtSnowBtn" onclick="setDebtStrategy('snowball')"  class="${debtStrategy==='snowball'?'active':''}">Snowball</button>
            </div>
        </div>
        <p class="text-xs text-gray-500 mb-4">${debtStrategy === 'avalanche' ? 'Paying highest interest rate first — minimizes total interest paid.' : 'Paying lowest balance first — builds momentum.'}</p>
        <div class="space-y-4">
            ${sorted.map((d, i) => `
                <div class="p-4 bg-darker rounded border border-gray-800 ${i===0?'border-neon/40':''}">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            ${i===0?'<span class="aero-badge neon mb-1"><i class="fas fa-crosshairs"></i> Attack First</span><br>':''}
                            <span class="font-bold">${d.name}</span>
                        </div>
                        <span class="text-red-400 font-bold">${formatCurrency(d.balance)}</span>
                    </div>
                    <div class="flex justify-between text-xs text-gray-500">
                        <span>APR: <span class="text-yellow-400">${d.rate}%</span></span>
                        <span>Min: ${formatCurrency(d.minPay)}/mo</span>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="mt-4 p-3 bg-dark rounded border border-gray-800 text-xs text-gray-400">
            Total Debt: <span class="text-red-400 font-bold">${formatCurrency(totalDebt)}</span>
        </div>`;
}

function setDebtStrategy(s) {
    debtStrategy = s;
    renderDebtOptimizer('debtOptimizerContainer');
}

// ═══════════════════════════════════════════════════════════
//  VIEWS
// ═══════════════════════════════════════════════════════════

// ── Landing ──────────────────────────────────────────────
function renderLandingView() {
    currentView = 'landing';
    appContainer.innerHTML = `
        <div class="w-full flex flex-col md:flex-row items-center justify-between p-12 min-h-screen">
            <div class="w-full md:w-1/2 h-96 md:h-full flex items-center justify-center relative">
                <div class="absolute inset-0 bg-gradient-to-r from-transparent to-darkest z-10 pointer-events-none"></div>
                <spline-viewer loading="lazy" url="https://prod.spline.design/qE0u5NqW1j-G-tB5/scene.splinecode"></spline-viewer>
            </div>
            <div class="w-full md:w-1/2 text-center md:text-left z-20 space-y-6">
                <h1 class="hero-title text-6xl font-bold neon-text-glow leading-tight" aria-label="Financial Intelligence, Elevated.">
                    <span style="white-space: nowrap; display: inline-block;">
                        <span class="animate-letter" style="--i:1;">F</span>
                        <span class="animate-letter" style="--i:2;">i</span>
                        <span class="animate-letter" style="--i:3;">n</span>
                        <span class="animate-letter" style="--i:4;">a</span>
                        <span class="animate-letter" style="--i:5;">n</span>
                        <span class="animate-letter" style="--i:6;">c</span>
                        <span class="animate-letter" style="--i:7;">i</span>
                        <span class="animate-letter" style="--i:8;">a</span>
                        <span class="animate-letter" style="--i:9;">l</span>
                    </span>
                    &nbsp;
                    <span style="white-space: nowrap; display: inline-block;">
                        <span class="animate-letter" style="--i:10;">I</span>
                        <span class="animate-letter" style="--i:11;">n</span>
                        <span class="animate-letter" style="--i:12;">t</span>
                        <span class="animate-letter" style="--i:13;">e</span>
                        <span class="animate-letter" style="--i:14;">l</span>
                        <span class="animate-letter" style="--i:15;">l</span>
                        <span class="animate-letter" style="--i:16;">i</span>
                        <span class="animate-letter" style="--i:17;">g</span>
                        <span class="animate-letter" style="--i:18;">e</span>
                        <span class="animate-letter" style="--i:19;">n</span>
                        <span class="animate-letter" style="--i:20;">c</span>
                        <span class="animate-letter" style="--i:21;">e</span><span class="animate-letter" style="--i:22;">,</span>
                    </span>
                    &nbsp;
                    <span style="white-space: nowrap; display: inline-block;">
                        <span class="animate-letter" style="--i:23;">E</span>
                        <span class="animate-letter" style="--i:24;">l</span>
                        <span class="animate-letter" style="--i:25;">e</span>
                        <span class="animate-letter" style="--i:26;">v</span>
                        <span class="animate-letter" style="--i:27;">a</span>
                        <span class="animate-letter" style="--i:28;">t</span>
                        <span class="animate-letter" style="--i:29;">e</span>
                        <span class="animate-letter" style="--i:30;">d</span><span class="animate-letter" style="--i:31;">.</span>
                    </span>
                </h1>
                <p class="text-gray-400 text-lg leading-relaxed scroll-reveal">Aero Finance: AI-driven insights, autonomous goal tracking, real-time WebSocket state sync, and predictive budgeting. Your money, in full control.</p>
                <div class="flex flex-col sm:flex-row gap-4 justify-center md:justify-start scroll-reveal">
                    <button onclick="openAuthModal()" id="hero-signup-btn" class="bg-neon text-black px-8 py-3 rounded-full font-bold text-lg hover:brightness-110 transition neon-box-glow">
                        Initiate Flight Sequence
                    </button>
                    <button onclick="() => { authMode='login'; updateAuthUI(); openAuthModal(); }" class="border border-gray-700 text-gray-300 px-8 py-3 rounded-full font-semibold text-lg hover:border-neon hover:text-neon transition">
                        Login
                    </button>
                </div>
                <div class="flex gap-8 justify-center md:justify-start pt-4 scroll-reveal">
                    <div class="text-center"><p class="text-2xl font-bold text-neon">AI</p><p class="text-xs text-gray-500">Powered</p></div>
                    <div class="text-center"><p class="text-2xl font-bold text-neon">∞</p><p class="text-xs text-gray-500">Real-Time</p></div>
                    <div class="text-center"><p class="text-2xl font-bold text-neon">PG</p><p class="text-xs text-gray-500">Persistent DB</p></div>
                </div>
            </div>
        </div>`;
    // wire login button on landing
    document.querySelector('#hero-signup-btn').addEventListener('click', () => { authMode='signup'; window.updateAuthUI?.(); openAuthModal(); });

    applyScrollAnimations();
    injectAtmosphericOrbs(appContainer);
}

// ── Dashboard ─────────────────────────────────────────────
function renderDashboardView() {
    currentView = 'dashboard';
    const rawSafe       = calcRawSafeToSpend();
    const safeToSpend   = Math.max(rawSafe, 0);
    const isDanger      = rawSafe < 0;
    const surplus       = calcSweepSurplus();
    const totalBalance  = state.user?.balance || 0;
    const thisMonth     = new Date().toISOString().split('-')[1];
    let monthIncome = 0, monthExpense = 0;
    state.transactions.forEach(t => {
        if (t.date.split('-')[1] === thisMonth) {
            if (t.type === 'income') monthIncome += t.amount;
            else monthExpense += Math.abs(t.amount);
        }
    });

    // Dynamic Aero Insights
    const insights = [];
    if (surplus > 0) {
        insights.push({ color: 'neon', title: 'Auto-Sweep Ready', body: `You have a surplus of <strong>${formatCurrency(surplus)}</strong> above your safety buffer. Recommend sweeping to "<strong>${state.goals[0]?.name || 'Emergency Fund'}</strong>".`, btn: `<button onclick="executeSweep(${surplus.toFixed(2)})" class="mt-2 text-xs bg-neon text-black px-3 py-1 rounded font-bold hover:brightness-110 transition">Execute Sweep</button>` });
    }
    if (isDanger) {
        insights.push({ color: 'red-500', title: '⚠ Liability Overload', body: `Your liabilities exceed your balance by <strong>${formatCurrency(Math.abs(rawSafe))}</strong>. Automated sweeps are paused. Take action immediately.`, btn: '' });
    }
    const nearBudgets = state.budgets.filter(b => b.limit > 0 && (b.spent / b.limit) >= 0.9);
    nearBudgets.forEach(b => {
        insights.push({ color: 'yellow-400', title: `Budget Alert: ${b.category}`, body: `At ${Math.round((b.spent/b.limit)*100)}% capacity. Forecast: overspend within days.`, btn: '' });
    });
    if (!insights.length) {
        insights.push({ color: 'neon', title: 'All Systems Nominal', body: 'No critical alerts. Continue at current velocity for optimal financial health.', btn: '' });
    }

    const recentTx = [...state.transactions].sort((a,b) => b.date > a.date ? 1 : -1).slice(0, 4);

    appContainer.innerHTML = `
        ${sidebar('dashboard')}
        <div class="flex-grow p-6 md:p-8 overflow-y-auto">
            <header class="flex justify-between items-end mb-8">
                <div>
                    <h2 class="text-3xl font-bold">Command Center</h2>
                    <p class="text-gray-500 text-sm">Aero System overview active.</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="openCommandBar()" class="hidden md:flex items-center gap-2 text-xs border border-gray-700 rounded px-3 py-1.5 text-gray-400 hover:border-neon hover:text-neon transition" title="Open Command Bar (Ctrl+K)">
                        <i class="fas fa-terminal text-neon"></i> Command Bar
                        <span class="font-mono text-[10px] bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">Ctrl+K</span>
                    </button>
                    <button onclick="openTxModal()" class="bg-neon text-black px-4 py-2 rounded font-bold hover:brightness-110 transition text-sm flex items-center gap-2">
                        <i class="fas fa-plus"></i> New Entry
                    </button>
                </div>
            </header>

            <!-- KPI Grid -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="dashboard-card scroll-reveal stagger-1 ws-flash-target p-6 ${isDanger ? 'safe-card-danger' : 'border-neon'}" style="${isDanger ? '' : 'box-shadow:0 0 20px rgba(20,241,149,0.15)'}">
                    <div class="flex justify-between items-start">
                        <p class="text-sm text-gray-500 mb-2">Safe to Spend</p>
                        <i class="fas fa-shield-alt ${isDanger ? 'text-red-400' : 'text-neon'}"></i>
                    </div>
                    <h3 class="text-4xl font-bold ${isDanger ? 'text-red-400 red-text-glow' : 'text-neon neon-text-glow'}">${formatCurrency(safeToSpend)}</h3>
                    <p class="text-xs text-gray-400 mt-2">${isDanger ? '⚠ Liabilities exceed balance' : 'Balance − Bills − Goal Contributions'}</p>
                </div>
                <div class="dashboard-card scroll-reveal stagger-2 ws-flash-target p-6">
                    <p class="text-sm text-gray-500 mb-2">Total Balance</p>
                    <h3 class="text-3xl font-bold text-white">${formatCurrency(totalBalance)}</h3>
                    <p class="text-xs text-gray-400 mt-2">${state.user?.bank || 'Connected Account'}</p>
                </div>
                <div class="dashboard-card scroll-reveal stagger-3 ws-flash-target p-6">
                    <p class="text-sm text-gray-500 mb-2">Monthly Pulse</p>
                    <div class="w-full h-16 relative mt-2"><canvas id="cashFlowChart"></canvas></div>
                    <div class="flex justify-between text-xs mt-2">
                        <span class="text-neon">+${formatCurrency(monthIncome)}</span>
                        <span class="text-red-400">-${formatCurrency(monthExpense)}</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <!-- Recent Pulse -->
                <div class="dashboard-card scroll-reveal stagger-1 p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold">Recent Pulse</h3>
                        <button onclick="renderTransactionsView()" class="text-sm text-neon hover:underline">View All</button>
                    </div>
                    <div class="space-y-3">
                        ${recentTx.map(t => `
                        <div class="flex justify-between items-center p-3 bg-dark rounded border border-gray-800 hover:border-gray-700 transition">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full flex items-center justify-center ${t.type==='income'?'bg-neon/10':'bg-red-500/10'}">
                                    <i class="fas ${t.type==='income'?'fa-arrow-down text-neon':'fa-arrow-up text-red-400'} text-xs"></i>
                                </div>
                                <div>
                                    <p class="font-semibold text-sm">${t.description}</p>
                                    <p class="text-xs text-gray-500">${t.date} · ${t.category}</p>
                                </div>
                            </div>
                            <p class="font-bold ${t.type==='income'?'text-neon':'text-red-400'}">${t.type==='income'?'+':''}${formatCurrency(t.amount)}</p>
                        </div>`).join('')}
                    </div>
                </div>
                <!-- Aero Insights -->
                <div class="dashboard-card scroll-reveal stagger-2 p-6 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-5"><i class="fas fa-brain text-9xl text-neon"></i></div>
                    <h3 class="text-lg font-bold mb-4 flex items-center gap-2"><i class="fas fa-sparkles text-neon"></i> Aero Insights</h3>
                    <div class="space-y-3 relative z-10">
                        ${insights.map(ins => `
                        <div class="p-3 bg-dark rounded border-l-2 border-${ins.color}">
                            <p class="text-sm"><strong>${ins.title}:</strong> ${ins.body}</p>
                            ${ins.btn}
                        </div>`).join('')}
                    </div>
                </div>
            </div>

            <!-- Goals Quick View & HYSA Widget -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <!-- Goals Quick View -->
                <div class="dashboard-card scroll-reveal stagger-1 p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold">Active Vectors</h3>
                        <button onclick="renderGoalsView()" class="text-sm text-neon hover:underline">Manage</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${state.goals.slice(0,4).map(g => {
                            const pct = Math.min((g.current/g.target)*100, 100);
                            return `<div class="space-y-1">
                                <div class="flex justify-between text-sm">
                                    <span class="font-semibold">${g.name}</span>
                                    <span class="text-gray-400">${Math.round(pct)}%</span>
                                </div>
                                <div class="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                                    <div class="h-2 rounded-full progress-bar-fill" style="width:${pct}%;background-color:${g.color}"></div>
                                </div>
                                <p class="text-xs text-gray-500">${formatCurrency(g.current)} / ${formatCurrency(g.target)}</p>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <!-- Virtual HYSA Widget -->
                <div class="dashboard-card scroll-reveal stagger-2 ws-flash-target p-6 flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <h3 class="text-lg font-bold flex items-center gap-2">
                                <i class="fas fa-vault text-neon"></i> Virtual HYSA
                            </h3>
                            <span class="aero-badge neon text-[10px]">5.25% APY</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-4">Accrues interest compounded daily.</p>
                        <div class="text-4xl font-bold text-neon neon-text-glow mb-1">
                            ${formatCurrency(state.user?.hysa_balance || 0)}
                        </div>
                    </div>
                    <div class="flex justify-between items-center mt-4 pt-4 border-t border-gray-800">
                        <div>
                            <p class="text-xs text-gray-400">Available Surplus</p>
                            <p class="text-sm font-bold text-white">${formatCurrency(Math.max(calcSweepSurplus(), 0))}</p>
                        </div>
                        <button onclick="executeSweep(calcSweepSurplus())" class="bg-neon text-black px-4 py-1.5 rounded font-bold hover:brightness-110 transition text-xs flex items-center gap-1">
                            <i class="fas fa-arrow-right"></i> Sweep Surplus
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

    // Cash flow mini bar
    const ctx = document.getElementById('cashFlowChart')?.getContext('2d');
    if (ctx) {
        new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Earned','Spent'], datasets: [{ data:[monthIncome, monthExpense], backgroundColor:['#14F195','#ef4444'], borderRadius:4 }] },
            options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:false},y:{display:false}} }
        });
    }
    applyScrollAnimations();
    injectAtmosphericOrbs(appContainer);
}

// ── Transactions ──────────────────────────────────────────
function renderTransactionsView() {
    currentView = 'transactions';
    const sortedTx = [...state.transactions];
    const totalChanges   = sortedTx.reduce((s,t) => s + (t.type==='income'?t.amount:-t.amount), 0);
    const initialBalance = (state.user?.balance || 0) - totalChanges;
    let running = initialBalance;
    const chartData   = [running];
    const chartLabels = ['Start'];
    sortedTx.forEach(t => {
        running += t.type==='income' ? t.amount : -t.amount;
        chartData.push(running); chartLabels.push(t.date);
    });

    appContainer.innerHTML = `
        ${sidebar('transactions')}
        <div class="flex-grow p-6 md:p-8 overflow-y-auto flex flex-col" style="min-height:0">
            <header class="flex justify-between items-end mb-6">
                <div><h2 class="text-3xl font-bold">Ledger Archive</h2></div>
                <div class="flex gap-3 items-center">
                    <div class="relative">
                        <i class="fas fa-search absolute left-3 top-3 text-gray-500 text-sm"></i>
                        <input type="text" id="nlpSearchInput" placeholder="NLP: 'groceries over $50 last week', 'NOT dining'" class="w-72 bg-dark border border-gray-700 rounded p-2 pl-9 text-sm text-white focus:border-neon focus:outline-none transition">
                    </div>
                    <button onclick="openTxModal()" class="bg-neon text-black px-3 py-2 rounded font-bold hover:brightness-110 transition text-sm whitespace-nowrap"><i class="fas fa-plus mr-1"></i>New</button>
                </div>
            </header>

            <!-- Chart -->
            <div class="dashboard-card scroll-reveal p-4 mb-6 h-56 relative flex items-center justify-center flex-shrink-0">
                <canvas id="txGraph" class="w-full h-full"></canvas>
                <div id="txZeroState" class="hidden absolute inset-0 border border-dashed border-gray-800/60 rounded bg-darker/20 pointer-events-none"></div>
            </div>

            <!-- Table -->
            <div class="dashboard-card scroll-reveal overflow-hidden flex flex-col flex-grow" style="min-height:0">
                <div class="bg-darker p-4 border-b border-gray-800 grid grid-cols-5 font-bold text-gray-400 text-sm">
                    <div>Date</div><div class="col-span-2">Description</div><div>Category</div><div class="text-right">Amount</div>
                </div>
                <div id="txList" class="overflow-y-auto flex-grow">
                    ${buildTxRows(state.transactions)}
                </div>
            </div>
        </div>`;

    // NLP search
    document.getElementById('nlpSearchInput').addEventListener('input', e => {
        const filtered = applyNLPFilter(state.transactions, e.target.value);
        document.getElementById('txList').innerHTML = buildTxRows(filtered);
    });

    // Chart
    const canvas = document.getElementById('txGraph');
    const zeroEl = document.getElementById('txZeroState');
    if (!state.transactions.length) {
        canvas.classList.remove('hidden'); zeroEl.classList.remove('hidden');
        const ctx = canvas.getContext('2d');
        if (window.txChartInstance) {
            window.txChartInstance.destroy();
        }

        // Custom Empty State Canvas Drawing Plugin
        const emptyStatePlugin = {
            id: 'emptyState',
            afterDraw: (chart) => {
                const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
                ctx.save();

                // 1. Grid/Dot Visual Texture (cyberpunk blueprint vibe)
                ctx.strokeStyle = 'rgba(20, 241, 149, 0.03)';
                ctx.lineWidth = 1;
                const gridSize = 20;
                for (let x = left; x <= right; x += gridSize) {
                    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
                }
                for (let y = top; y <= bottom; y += gridSize) {
                    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
                }

                // Tech ring & crosshair
                const cx = left + width / 2;
                const cy = top + height / 2;
                ctx.strokeStyle = 'rgba(20, 241, 149, 0.12)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy - 15, 35, 0, 2 * Math.PI);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(cx - 45, cy - 15); ctx.lineTo(cx + 45, cy - 15);
                ctx.moveTo(cx, cy - 60); ctx.lineTo(cx, cy + 30);
                ctx.stroke();

                // 2. Typography: "Awaiting transaction vector initiation..."
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#14F195';
                ctx.font = '600 14px "Inter", sans-serif';
                ctx.shadowColor = 'rgba(20, 241, 149, 0.6)';
                ctx.shadowBlur = 8;
                ctx.fillText('Awaiting transaction vector initiation...', cx, cy + 45);

                ctx.shadowBlur = 0;
                ctx.fillStyle = '#6b7280';
                ctx.font = '400 11px "Inter", sans-serif';
                ctx.fillText('Secure the first entry to activate trajectory telemetry.', cx, cy + 68);

                ctx.restore();
            }
        };

        window.txChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Balance',
                    data: [],
                    borderColor: '#14F195',
                    borderWidth: 2
                }]
            },
            plugins: [emptyStatePlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { display: false }, y: { display: false } }
            }
        });
    } else {
        canvas.classList.remove('hidden'); zeroEl.classList.add('hidden');
        if (window.txChartInstance) {
            window.txChartInstance.destroy();
        }
        const ctx = canvas.getContext('2d');
        window.txChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Balance', data: chartData,
                    borderColor: '#14F195', borderWidth: 2, tension: 0.3,
                    pointRadius: 4, pointHoverRadius: 6,
                    pointBackgroundColor: ctx => {
                        const i = ctx.dataIndex;
                        if (i === 0) return '#6b7280';
                        const tx = sortedTx[i-1];
                        return tx?.type === 'income' ? '#14F195' : '#ef4444';
                    },
                    pointBorderColor: ctx => {
                        const i = ctx.dataIndex;
                        if (i === 0) return '#6b7280';
                        return sortedTx[i-1]?.type === 'income' ? '#14F195' : '#ef4444';
                    },
                    segment: { borderColor: c => c.p0.parsed.y > c.p1.parsed.y ? '#ef4444' : '#14F195' }
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => {
                        const i = ctx.dataIndex;
                        if (i === 0) return `Initial: ${formatCurrency(ctx.parsed.y)}`;
                        const tx = sortedTx[i-1];
                        return [`Balance: ${formatCurrency(ctx.parsed.y)}`, `${tx?.description} (${tx?.category})`, `${tx?.type==='income'?'+':'-'}${formatCurrency(tx?.amount)}`];
                    }}}
                },
                scales: { x: { display: false }, y: { grid: { color: '#111' }, ticks: { color: '#6b7280', callback: v => formatCurrency(v) } } }
            }
        });
    }
    applyScrollAnimations();
}

function buildTxRows(txs) {
    if (!txs.length) return `<div class="p-8 text-center text-gray-600 text-sm">No transactions match your query.</div>`;
    return txs.map(t => `
        <div class="grid grid-cols-5 p-4 border-b border-gray-800 hover:bg-dark/50 transition items-center text-sm">
            <div class="text-gray-500">${t.date}</div>
            <div class="col-span-2 font-semibold truncate">${t.description}</div>
            <div><span class="bg-gray-800 text-xs px-2 py-0.5 rounded text-gray-300">${t.category}</span></div>
            <div class="text-right font-bold ${t.type==='income'?'text-neon':'text-red-400'}">${t.type==='income'?'+':''}${formatCurrency(t.amount)}</div>
        </div>`).join('');
}

// ── Budgeting ─────────────────────────────────────────────
function renderBudgetingView() {
    currentView = 'budgeting';
    const streak  = computeStreak();
    const badges  = getBadges(streak, state.transactions.length);

    appContainer.innerHTML = `
        ${sidebar('budgeting')}
        <div class="flex-grow p-6 md:p-8 overflow-y-auto">
            <header class="flex justify-between items-end mb-8">
                <div><h2 class="text-3xl font-bold">Resource Allocation</h2></div>
                <button id="budgetAiBtn" onclick="runBudgetAI()" class="bg-neon text-black px-4 py-2 rounded font-bold hover:brightness-110 transition flex items-center gap-2 text-sm">
                    <i class="fas fa-magic"></i> One-Click Budget AI
                </button>
            </header>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <!-- Active Limits -->
                <div class="lg:col-span-2 dashboard-card p-6">
                    <h3 class="text-xl font-bold mb-6">Active Limits</h3>
                    <div class="space-y-5">
                        ${state.budgets.map(b => {
                            const pct = (b.spent / b.limit) * 100;
                            const isCritical = pct >= 90;
                            return `<div>
                                <div class="flex justify-between mb-1 text-sm">
                                    <span class="font-semibold">${b.category}</span>
                                    <span class="${isCritical?'text-red-400':'text-gray-400'}">${formatCurrency(b.spent)} / ${formatCurrency(b.limit)}</span>
                                </div>
                                <div class="w-full bg-gray-800 rounded-full h-2 overflow-hidden ${isCritical?'critical-glow':''}">
                                    <div class="h-2 rounded-full progress-bar-fill ${isCritical?'bg-red-500':'bg-neon'}" style="width:${Math.min(pct,100)}%"></div>
                                </div>
                                ${isCritical ? '<p class="text-xs text-red-400 mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>90%+ capacity — review spending</p>' : ''}
                            </div>`;
                        }).join('') || '<p class="text-gray-500 text-sm">No budget limits set. Use Budget AI to generate.</p>'}
                    </div>
                </div>

                <!-- Credit Score + Gamification -->
                <div class="space-y-6">
                    <div class="dashboard-card p-6">
                        <h3 class="text-lg font-bold mb-4">Credit Score AI</h3>
                        <div class="flex items-center gap-4 mb-3">
                            <div class="text-4xl font-bold text-neon neon-text-glow">742</div>
                            <div class="text-sm text-neon"><i class="fas fa-arrow-up"></i> +5 pts</div>
                        </div>
                        <p class="text-gray-400 text-xs leading-relaxed border-l-2 border-neon pl-3 bg-darker p-2 rounded">
                            "Score improved: credit utilization dropped below 10% after recent payment. Maintain this ratio for continued improvement."
                        </p>
                    </div>
                    <div class="dashboard-card p-6">
                        <h3 class="text-lg font-bold mb-4">Pilot Streaks & Badges</h3>
                        <div class="flex items-center gap-4 mb-4">
                            <div class="streak-ring">
                                <span class="text-2xl font-bold text-neon">${streak}</span>
                                <span class="text-xs text-gray-400">days</span>
                            </div>
                            <div>
                                <p class="font-bold">Log Streak</p>
                                <p class="text-xs text-gray-500">Consecutive days tracked</p>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${badges.map(b => `<div class="aero-badge ${b.cls}"><i class="fas ${b.icon}"></i>${b.label}</div>`).join('')}
                            ${!badges.length ? '<p class="text-xs text-gray-600">Log 7+ days to earn your first badge.</p>' : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Row 2 -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <!-- Purchase Impact Calculator -->
                <div class="dashboard-card p-6">
                    <h3 class="text-xl font-bold mb-2">Purchase Impact Calculator</h3>
                    <p class="text-gray-500 text-sm mb-4">See how a purchase delays your savings goals.</p>
                    <div class="space-y-3 mb-4">
                        <input type="text" id="impactName" placeholder="Item Name (e.g., MacBook Pro)" class="w-full bg-dark border border-gray-700 rounded p-2 text-sm text-white focus:border-neon focus:outline-none">
                        <input type="number" id="impactCost" placeholder="Cost Amount" class="w-full bg-dark border border-gray-700 rounded p-2 text-sm text-white focus:border-neon focus:outline-none">
                        <button id="calcImpactBtn" class="w-full border border-neon text-neon px-4 py-2 rounded hover:bg-neon hover:text-black transition text-sm font-semibold">Analyze Impact</button>
                    </div>
                    <div class="h-40"><canvas id="impactGraph"></canvas></div>
                </div>

                <!-- Portfolio / Tax-Loss Harvesting -->
                <div class="dashboard-card p-6">
                    <h3 class="text-xl font-bold mb-2">Portfolio Simulator</h3>
                    <p class="text-gray-500 text-sm mb-4">Risk-based diversification · Tax-loss harvesting scan</p>
                    <div class="space-y-3 mb-4">
                        <div>
                            <label class="text-xs text-gray-400 mb-1 block">Risk Tolerance</label>
                            <div class="flex gap-2">
                                ${['Conservative','Moderate','Aggressive'].map(r => `<button onclick="selectRisk('${r}', this)" class="risk-btn flex-1 py-1 text-xs rounded border border-gray-700 text-gray-400 hover:border-neon hover:text-neon transition">${r}</button>`).join('')}
                            </div>
                        </div>
                        <div id="portfolioOutput" class="text-xs text-gray-500 bg-dark p-3 rounded border border-gray-800">Select a risk profile to generate allocation.</div>
                    </div>
                    <div class="p-3 bg-dark rounded border border-yellow-400/30">
                        <p class="text-xs font-bold text-yellow-400 mb-1"><i class="fas fa-leaf mr-1"></i>Tax-Loss Harvesting Scanner</p>
                        <p class="text-xs text-gray-500">Potential savings: <span class="text-yellow-400 font-bold">~${formatCurrency(state.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)*0.02)}</span> in deductibles identified.</p>
                    </div>
                </div>
            </div>

            <!-- Debt Optimizer -->
            <div class="dashboard-card p-6" id="debtOptimizerContainer">
                <p class="text-gray-500 text-sm">Loading debt optimizer...</p>
            </div>
        </div>`;

    // Impact chart
    const impCtx = document.getElementById('impactGraph').getContext('2d');
    let impactChart = new Chart(impCtx, {
        type: 'bar',
        data: { labels: state.goals.map(g=>g.name), datasets:[{ label:'Delay (months)', data: state.goals.map(()=>0), backgroundColor:'#ef4444', borderRadius:4 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{color:'#6b7280'}},x:{ticks:{color:'#6b7280'}}} }
    });
    document.getElementById('calcImpactBtn').addEventListener('click', () => {
        const cost = parseFloat(document.getElementById('impactCost').value)||0;
        const monthlyIncome = state.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0) / Math.max(state.transactions.length/30,1);
        const monthly = monthlyIncome || 1000;
        impactChart.data.datasets[0].data = state.goals.map(g => {
            const remaining = Math.max(g.target - g.current, 0);
            const monthsWithout = remaining / (monthly * 0.2);
            const monthsWith    = (remaining + cost) / (monthly * 0.2);
            return Math.max(Math.round((monthsWith - monthsWithout)*10)/10, 0);
        });
        impactChart.update();
    });

    // Debt optimizer
    renderDebtOptimizer('debtOptimizerContainer');
    applyScrollAnimations();
}

function selectRisk(risk, btn) {
    document.querySelectorAll('.risk-btn').forEach(b => b.className = 'risk-btn flex-1 py-1 text-xs rounded border border-gray-700 text-gray-400 hover:border-neon hover:text-neon transition');
    btn.className = 'risk-btn flex-1 py-1 text-xs rounded border border-neon text-neon font-bold transition';
    const allocations = {
        Conservative: [['Broad-Market ETF','40%'],['Treasury Bonds','30%'],['High-Yield Savings','20%'],['Index Funds','10%']],
        Moderate:     [['Index Funds','35%'],['Broad-Market ETF','30%'],['Treasury Bonds','20%'],['High-Yield Savings','15%']],
        Aggressive:   [['Index Funds','50%'],['Broad-Market ETF','35%'],['High-Yield Savings','10%'],['Treasury Bonds','5%']],
    };
    const alloc = allocations[risk] || [];
    document.getElementById('portfolioOutput').innerHTML = alloc.map(([a,p]) =>
        `<div class="flex justify-between py-0.5"><span class="text-gray-300">${a}</span><span class="text-neon font-bold">${p}</span></div>`
    ).join('');
}

// ── Bills & Subscriptions ─────────────────────────────────
function renderBillsView() {
    currentView = 'bills';
    const totalBills = state.bills.reduce((s,b) => s+(b.status==='cancellation_pending'?0:b.amount), 0);
    appContainer.innerHTML = `
        ${sidebar('bills')}
        <div class="flex-grow p-6 md:p-8 overflow-y-auto">
            <header class="flex justify-between items-end mb-8">
                <div><h2 class="text-3xl font-bold">Liabilities & Subs</h2></div>
                <button onclick="exportTaxCSV()" class="bg-darker border border-gray-700 text-white px-4 py-2 rounded hover:border-neon hover:text-neon transition flex items-center gap-2 text-sm">
                    <i class="fas fa-file-csv"></i> Export Tax CSV
                </button>
            </header>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <!-- Subscription Manager -->
                <div class="col-span-2 dashboard-card p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold">Subscription Manager</h3>
                        <span class="text-sm text-gray-400">Total: <span class="text-red-400 font-bold">${formatCurrency(totalBills)}/mo</span></span>
                    </div>
                    <div class="space-y-3">
                        ${state.bills.map(b => `
                        <div class="flex justify-between items-center p-4 bg-darker rounded border ${b.status==='cancellation_pending'?'border-yellow-400/40':'border-gray-800'} hover:border-gray-700 transition">
                            <div>
                                <div class="flex items-center gap-2 flex-wrap">
                                    <p class="font-bold">${b.name}</p>
                                    ${b.alert ? `<span class="aero-badge gold" style="font-size:9px"><i class="fas fa-bell"></i>${b.alertMsg}</span>` : ''}
                                    ${b.autoPay ? `<span class="aero-badge neon" style="font-size:9px"><i class="fas fa-robot"></i>Auto-Pay</span>` : ''}
                                    ${b.status==='cancellation_pending' ? `<span class="aero-badge" style="font-size:9px;background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.4);color:#fbbf24"><i class="fas fa-clock"></i>Cancellation Pending</span>` : ''}
                                </div>
                                <p class="text-xs text-gray-500 mt-0.5">Due on the ${b.date}th of each month</p>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="font-bold ${b.status==='cancellation_pending'?'line-through text-gray-600':''}">${formatCurrency(b.amount)}</span>
                                ${b.status !== 'cancellation_pending' ? `<button onclick="cancelSubscription('${b.name}')" class="text-xs text-red-400 border border-red-400/50 px-2 py-1 rounded hover:bg-red-400 hover:text-black transition whitespace-nowrap">Cancel</button>` : ''}
                            </div>
                        </div>`).join('') || '<p class="text-gray-500 text-sm text-center py-4">No bills tracked.</p>'}
                    </div>
                </div>

                <!-- Sidebar cards -->
                <div class="space-y-4">
                    <!-- Overdraft Risk (dynamic) -->
                    ${(() => {
                        const raw = calcRawSafeToSpend();
                        if (raw < 0) return `
                        <div class="dashboard-card danger-card p-5">
                            <h3 class="text-lg font-bold mb-2 text-red-400 flex items-center gap-2"><i class="fas fa-exclamation-triangle"></i>Overdraft Risk</h3>
                            <p class="text-sm text-gray-400 mb-3">Liabilities exceed balance by <strong class="text-red-400">${formatCurrency(Math.abs(raw))}</strong>. Immediate reallocation required.</p>
                            <button onclick="renderGoalsView()" class="w-full bg-red-900/30 border border-red-500 text-red-400 py-2 rounded hover:bg-red-500 hover:text-black transition text-sm">Adjust Goals</button>
                        </div>`;
                        return `<div class="dashboard-card p-5">
                            <h3 class="text-lg font-bold mb-2 text-neon flex items-center gap-2"><i class="fas fa-check-circle"></i>Cash Flow Guard</h3>
                            <p class="text-sm text-gray-400">Safe margin: <span class="text-neon font-bold">${formatCurrency(raw)}</span>. No overdraft risk detected.</p>
                        </div>`;
                    })()}
                    <!-- Overhead Calendar -->
                    <div class="dashboard-card p-4">
                        <h3 class="text-base font-bold mb-3">Overhead Calendar</h3>
                        ${buildCalendar()}
                    </div>
                </div>
            </div>
        </div>`;
    applyScrollAnimations();
}

// ── Goals & Savings ───────────────────────────────────────
function renderGoalsView() {
    currentView = 'goals';
    const burnout   = calcBurnoutMonths();
    const reserve   = calcEmergencyReserve();
    const surplus   = calcSweepSurplus();
    const userAge   = state.user?.age || 30;

    appContainer.innerHTML = `
        ${sidebar('goals')}
        <div class="flex-grow p-6 md:p-8 overflow-y-auto">
            <header class="flex justify-between items-end mb-8">
                <div><h2 class="text-3xl font-bold">Future Vectors</h2></div>
                <button onclick="openGoalModal()" class="bg-neon text-black px-4 py-2 rounded font-bold hover:brightness-110 transition flex items-center gap-2 text-sm">
                    <i class="fas fa-plus"></i> Add Goal
                </button>
            </header>

            <!-- KPIs -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div class="dashboard-card p-6 text-center">
                    <h3 class="text-lg font-bold mb-1">Burnout Tracker</h3>
                    <p class="text-gray-500 text-xs mb-3">Liquid survival duration at current velocity</p>
                    <div class="text-5xl font-bold ${burnout < 3 ? 'text-red-400' : burnout < 6 ? 'text-yellow-400' : 'text-neon'} mb-1">
                        ${burnout} <span class="text-2xl text-gray-400">mo</span>
                    </div>
                    <p class="text-xs text-gray-500">${burnout < 3 ? '⚠ Critical' : burnout < 6 ? '⚡ Moderate' : '✓ Healthy'}</p>
                </div>
                <div class="dashboard-card p-6 text-center">
                    <h3 class="text-lg font-bold mb-1">Emergency Reserve</h3>
                    <p class="text-gray-500 text-xs mb-3">3× monthly expenditure target</p>
                    <div class="text-4xl font-bold text-neon mb-1">${formatCurrency(reserve)}</div>
                    <p class="text-xs text-gray-500">Baseline: ${formatCurrency(reserve/3)}/mo avg spend</p>
                </div>
                <div class="dashboard-card p-6 text-center">
                    <h3 class="text-lg font-bold mb-1">Sweep Surplus</h3>
                    <p class="text-gray-500 text-xs mb-3">Deployable after bills + budget + $500 buffer</p>
                    <div class="text-4xl font-bold ${surplus>0?'text-neon':'text-red-400'} mb-1">${formatCurrency(Math.max(surplus,0))}</div>
                    ${surplus > 0 ? `<button onclick="executeSweep(${surplus.toFixed(2)})" class="text-xs bg-neon text-black px-3 py-1 rounded font-bold hover:brightness-110 mt-1">Sweep Now</button>` : '<p class="text-xs text-gray-500">No surplus available</p>'}
                </div>
            </div>

            <!-- Active Milestones -->
            <div class="dashboard-card p-6 mb-6">
                <h3 class="text-xl font-bold mb-4">Active Milestones</h3>
                ${state.goals.length ? `
                <div class="space-y-5">
                    ${state.goals.map(g => {
                        const pct = Math.min((g.current/g.target)*100,100);
                        const monthlyContrib = Math.max((g.target-g.current)/12,0);
                        const inflationAdj   = g.target * 1.03; // 3% inflation adjustment
                        return `<div class="p-4 bg-darker rounded border border-gray-800 hover:border-gray-700 transition">
                            <div class="flex justify-between items-start mb-2">
                                <div class="flex items-center gap-2">
                                    <div class="w-3 h-3 rounded-full" style="background:${g.color}"></div>
                                    <span class="font-bold">#${g.priority} ${g.name}</span>
                                </div>
                                <button onclick="removeGoal(${g.id})" class="text-red-500/60 hover:text-red-400 transition text-sm"><i class="fas fa-trash-alt"></i></button>
                            </div>
                            <div class="w-full bg-gray-800 rounded-full h-3 overflow-hidden mb-2">
                                <div class="h-3 rounded-full progress-bar-fill" style="width:${pct}%;background:${g.color}"></div>
                            </div>
                            <div class="flex justify-between text-xs text-gray-500">
                                <span>${formatCurrency(g.current)} / ${formatCurrency(g.target)} <span class="text-gray-600">(infl. adj: ${formatCurrency(inflationAdj)})</span></span>
                                <span>~${formatCurrency(monthlyContrib)}/mo contribution</span>
                            </div>
                        </div>`;
                    }).join('')}
                </div>` : `<div class="text-center py-8 text-gray-500">
                    <i class="fas fa-bullseye text-4xl mb-3 opacity-30"></i>
                    <p class="text-sm">No goals set. Add your first goal to start tracking.</p>
                </div>`}
            </div>

            <!-- Scenario Simulator -->
            <div class="dashboard-card p-6">
                <div class="flex items-center gap-3 mb-1">
                    <i class="fas fa-flask text-neon"></i>
                    <h3 class="text-xl font-bold">Scenario Simulator</h3>
                    <span class="aero-badge neon text-[10px]">LIVE</span>
                </div>
                <p class="text-gray-500 text-sm mb-6">Adjust market variables to model wealth trajectories in real-time — no server round-trips.</p>

                <!-- Simulator Controls -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 mb-6">
                    <!-- Market Return Delta -->
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Market Return Delta</label>
                            <span id="simReturnLabel" class="text-neon font-bold text-sm">7.0%</span>
                        </div>
                        <input type="range" id="simReturnSlider" min="-10" max="15" value="7" step="0.5" class="w-full">
                        <div class="flex justify-between text-[10px] text-gray-600 mt-1"><span>−10%</span><span>Baseline 7%</span><span>+15%</span></div>
                    </div>
                    <!-- Inflation Volatility -->
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Inflation Volatility</label>
                            <span id="simInflationLabel" class="text-yellow-400 font-bold text-sm">3.0%</span>
                        </div>
                        <input type="range" id="simInflationSlider" min="0" max="10" value="3" step="0.5" class="w-full">
                        <div class="flex justify-between text-[10px] text-gray-600 mt-1"><span>0%</span><span>Avg 3%</span><span>10%</span></div>
                    </div>
                    <!-- Monthly Contribution Base -->
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Monthly Contribution</label>
                            <span id="simContribLabel" class="text-neon font-bold text-sm">$500/mo</span>
                        </div>
                        <input type="range" id="simContribSlider" min="100" max="10000" value="500" step="50" class="w-full">
                        <div class="flex justify-between text-[10px] text-gray-600 mt-1"><span>$100</span><span>$5K</span><span>$10K</span></div>
                    </div>
                    <!-- Horizon -->
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Target Retirement Age</label>
                            <span id="simAgeLabel" class="text-neon font-bold text-sm">Age 60</span>
                        </div>
                        <input type="range" id="simAgeSlider" min="45" max="75" value="60" step="1" class="w-full">
                        <div class="flex justify-between text-[10px] text-gray-600 mt-1"><span>45</span><span>60</span><span>75</span></div>
                    </div>
                </div>

                <!-- Dynamic Goal Allotment Overrides -->
                ${state.goals.length ? `
                <div class="mb-6 p-4 bg-darker rounded border border-gray-800">
                    <p class="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Dynamic Goal Allotment Overrides <span class="text-gray-600">(adds to monthly contribution)</span></p>
                    <div class="space-y-3" id="goalAllotmentSliders">
                        ${state.goals.map(g => {
                            const defaultContrib = Math.round(Math.max((g.target - g.current) / 12, 0));
                            return `<div class="flex items-center gap-4">
                                <div class="flex items-center gap-2 w-40 shrink-0">
                                    <div class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${g.color}"></div>
                                    <span class="text-xs font-semibold truncate">${g.name}</span>
                                </div>
                                <input type="range" data-goal-id="${g.id}" class="goal-allot-slider flex-grow" min="0" max="${Math.max(defaultContrib * 3, 1000)}" value="${defaultContrib}" step="25">
                                <span class="goal-allot-label text-neon text-xs font-bold w-20 text-right shrink-0">${formatCurrency(defaultContrib)}/mo</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>` : ''}

                <!-- Projection Output -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="text-center p-4 bg-dark rounded border border-gray-800">
                        <p class="text-xs text-gray-500 mb-1">Nominal Wealth</p>
                        <p class="text-3xl font-bold text-neon neon-text-glow" id="simNominalOut">—</p>
                    </div>
                    <div class="text-center p-4 bg-dark rounded border border-neon/30" style="box-shadow:0 0 14px rgba(20,241,149,0.07)">
                        <p class="text-xs text-gray-500 mb-1">Real (Inflation-Adj.)</p>
                        <p class="text-3xl font-bold text-white" id="simRealOut">—</p>
                    </div>
                    <div class="text-center p-4 bg-dark rounded border border-gray-800">
                        <p class="text-xs text-gray-500 mb-1">Horizon</p>
                        <p class="text-3xl font-bold text-gray-300" id="simHorizonOut">— yrs</p>
                    </div>
                </div>
                <div class="relative h-56">
                    <canvas id="scenarioChart"></canvas>
                </div>
                <p class="text-[10px] text-gray-600 mt-3 text-center" id="simBreakdownOut">Adjust sliders to run scenario</p>
            </div>
        </div>`;

    // ── Scenario Simulator Logic ─────────────────────────
    let scenarioChart = null;

    function runSimulation() {
        const returnRate  = parseFloat(document.getElementById('simReturnSlider').value) / 100;
        const inflation   = parseFloat(document.getElementById('simInflationSlider').value) / 100;
        const baseContrib = parseInt(document.getElementById('simContribSlider').value);
        const retireAge   = parseInt(document.getElementById('simAgeSlider').value);
        const years       = Math.max(retireAge - userAge, 1);
        const months      = years * 12;
        const rMonthly    = returnRate / 12;

        // Sum goal allotment overrides
        let goalExtra = 0;
        document.querySelectorAll('.goal-allot-slider').forEach(sl => {
            goalExtra += parseInt(sl.value) || 0;
            const lbl = sl.closest('div')?.querySelector('.goal-allot-label');
            if (lbl) lbl.textContent = formatCurrency(parseInt(sl.value) || 0) + '/mo';
        });

        const totalContrib = baseContrib + goalExtra;
        const startBalance = state.user?.balance || 0;

        // Build year-by-year projection arrays
        const labels = [];
        const nominalSeries = [];
        const realSeries = [];
        let nomBal = startBalance;
        let realBal = startBalance;

        for (let y = 0; y <= years; y++) {
            labels.push(y === 0 ? 'Now' : `Yr ${y}`);
            nominalSeries.push(Math.round(nomBal));
            realSeries.push(Math.round(realBal));
            if (y < years) {
                // Compound monthly for one year
                for (let m = 0; m < 12; m++) {
                    nomBal  = nomBal  * (1 + rMonthly) + totalContrib;
                    const realReturn = rMonthly - (inflation / 12);
                    realBal = realBal * (1 + realReturn) + totalContrib;
                }
            }
        }

        // Update output cards
        document.getElementById('simNominalOut').textContent  = formatCurrency(nomBal);
        document.getElementById('simRealOut').textContent     = formatCurrency(Math.max(realBal, 0));
        document.getElementById('simHorizonOut').textContent  = `${years} yrs`;
        document.getElementById('simBreakdownOut').textContent =
            `${formatCurrency(totalContrib)}/mo  ·  ${(returnRate*100).toFixed(1)}% return  ·  ${(inflation*100).toFixed(1)}% inflation  ·  ${years} yr horizon`;

        // Update label spans
        document.getElementById('simReturnLabel').textContent   = `${(returnRate*100).toFixed(1)}%`;
        document.getElementById('simInflationLabel').textContent = `${(inflation*100).toFixed(1)}%`;
        document.getElementById('simContribLabel').textContent  = `${formatCurrency(totalContrib)}/mo`;
        document.getElementById('simAgeLabel').textContent      = `Age ${retireAge}`;

        // Colour the return label based on value
        const retLbl = document.getElementById('simReturnLabel');
        retLbl.className = returnRate < 0 ? 'text-red-400 font-bold text-sm'
                         : returnRate < 0.05 ? 'text-yellow-400 font-bold text-sm'
                         : 'text-neon font-bold text-sm';

        // Draw / update Chart.js
        const ctx = document.getElementById('scenarioChart')?.getContext('2d');
        if (!ctx) return;

        // Sub-sample labels for readability (max 15 points)
        const step = Math.max(1, Math.floor(labels.length / 14));
        const sampledLabels   = labels.filter((_, i) => i % step === 0 || i === labels.length - 1);
        const sampledNominal  = nominalSeries.filter((_, i) => i % step === 0 || i === nominalSeries.length - 1);
        const sampledReal     = realSeries.filter((_, i) => i % step === 0 || i === realSeries.length - 1);

        if (scenarioChart) {
            scenarioChart.data.labels                      = sampledLabels;
            scenarioChart.data.datasets[0].data            = sampledNominal;
            scenarioChart.data.datasets[1].data            = sampledReal;
            scenarioChart.update('none'); // instant, no animation on slider drag
        } else {
            scenarioChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: sampledLabels,
                    datasets: [
                        {
                            label: 'Nominal',
                            data: sampledNominal,
                            borderColor: '#14F195',
                            backgroundColor: 'rgba(20,241,149,0.08)',
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'Real (Inflation-Adj.)',
                            data: sampledReal,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245,158,11,0.05)',
                            borderWidth: 1.5,
                            borderDash: [5, 4],
                            pointRadius: 0,
                            fill: false,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 },
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: true, labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 20 } },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: {
                            ticks: {
                                color: '#6b7280', font: { size: 10 },
                                callback: v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`
                            },
                            grid: { color: 'rgba(255,255,255,0.04)' }
                        }
                    }
                }
            });
        }
    }

    // Wire all simulator sliders
    ['simReturnSlider','simInflationSlider','simContribSlider','simAgeSlider'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', runSimulation);
    });
    document.querySelectorAll('.goal-allot-slider').forEach(sl => {
        sl.addEventListener('input', runSimulation);
    });

    // Initial render
    runSimulation();
    applyScrollAnimations();
}

// ─── AI Chat Panel ────────────────────────────────────────
function openChatPanel() {
    let panel = document.getElementById('aeroChat');
    if (panel) { panel.classList.toggle('translate-x-full'); return; }

    panel = document.createElement('div');
    panel.id = 'aeroChat';
    panel.className = 'fixed right-0 top-0 h-full w-80 bg-darker border-l border-gray-800 z-50 flex flex-col shadow-2xl transition-transform duration-300';
    panel.innerHTML = `
        <div class="p-4 border-b border-gray-800 flex justify-between items-center">
            <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-neon animate-pulse"></div>
                <span class="font-bold text-neon">Aero AI</span>
                <span class="text-xs text-gray-500">Gemini-powered</span>
            </div>
            <button onclick="openChatPanel()" class="text-gray-500 hover:text-white transition"><i class="fas fa-times"></i></button>
        </div>
        <div id="chatMessages" class="flex-grow overflow-y-auto p-4 space-y-3">
            <div class="chat-bubble-ai p-3 bg-dark rounded-lg border border-gray-800 text-sm">
                Hello ${state.user?.name?.split(' ')[0] || 'Pilot'}! I'm your Aero AI co-pilot. Ask me about your finances, request navigation ("go to goals"), or run queries ("what did I spend on dining last month?").
            </div>
        </div>
        <div class="p-4 border-t border-gray-800 flex gap-2">
            <input id="chatInput" type="text" placeholder="Ask Aero anything..." class="flex-grow bg-dark border border-gray-700 rounded p-2 text-sm text-white focus:border-neon focus:outline-none transition">
            <button id="chatSendBtn" onclick="sendChatMessage()" class="bg-neon text-black w-10 h-10 rounded flex items-center justify-center hover:brightness-110 transition">
                <i class="fas fa-paper-plane text-sm"></i>
            </button>
        </div>`;
    document.body.appendChild(panel);
    document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });
}

async function sendChatMessage() {
    const input    = document.getElementById('chatInput');
    const messages = document.getElementById('chatMessages');
    const sendBtn  = document.getElementById('chatSendBtn');
    const text     = input.value.trim();
    if (!text) return;

    messages.innerHTML += `<div class="text-right"><span class="inline-block p-3 bg-neon text-black rounded-lg text-sm max-w-[90%]">${text}</span></div>`;
    input.value = '';
    sendBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i>';
    messages.scrollTop = messages.scrollHeight;

    // Local navigation commands
    const t = text.toLowerCase();
    let handled = false;
    if (t.includes('go to') || t.includes('open') || t.includes('navigate')) {
        if (t.includes('dashboard')) { renderDashboardView(); handled = true; }
        else if (t.includes('transaction') || t.includes('ledger')) { renderTransactionsView(); handled = true; }
        else if (t.includes('budget'))  { renderBudgetingView(); handled = true; }
        else if (t.includes('bill'))    { renderBillsView(); handled = true; }
        else if (t.includes('goal'))    { renderGoalsView(); handled = true; }
    }
    if (handled) {
        messages.innerHTML += `<div class="chat-bubble-ai p-3 bg-dark rounded-lg border border-gray-800 text-sm">Navigation complete.</div>`;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane text-sm"></i>';
        messages.scrollTop = messages.scrollHeight;
        return;
    }

    const token = localStorage.getItem('aero_token');
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ text, state: { balance: state.user?.balance, goals: state.goals?.length, topCategory: state.budgets[0]?.category } })
        });
        const data  = await res.json();
        const reply = data.reply || 'No response.';
        messages.innerHTML += `<div class="chat-bubble-ai p-3 bg-dark rounded-lg border border-gray-800 text-sm">${reply}</div>`;
    } catch(e) {
        messages.innerHTML += `<div class="chat-bubble-ai p-3 bg-dark rounded-lg border border-red-900 text-sm text-red-400">AI offline. Check connection.</div>`;
    } finally {
        sendBtn.innerHTML = '<i class="fas fa-paper-plane text-sm"></i>';
        messages.scrollTop = messages.scrollHeight;
    }
}
