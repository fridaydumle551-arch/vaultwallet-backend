/* ============================================
   VaultWallet Frontend - Backend Connected
   API Base URL: Change this to your backend
   ============================================ */

// CONFIG: Change this to your backend URL when deployed
const API_BASE_URL = 'http://localhost:5000/api';
// const API_BASE_URL = 'https://your-app.onrender.com/api'; // Production

const CURRENCIES = {
    USD: { symbol: '$', rate: 1 },
    NGN: { symbol: '₦', rate: 1500 },
    AUD: { symbol: 'A$', rate: 1.52 },
    CAD: { symbol: 'C$', rate: 1.36 }
};

let currentUser = null;
let currentCurrency = 'USD';
let authToken = localStorage.getItem('vw_token') || null;
let pinCallback = null;
let pinInput = '';
let currentFilter = 'all';
let editingField = null;
let socket = null;

/* ==================== API HELPERS ==================== */

async function apiRequest(endpoint, options = {}) {
    const url = API_BASE_URL + endpoint;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    if (authToken) {
        config.headers['Authorization'] = 'Bearer ' + authToken;
    }

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, message: 'Network error. Is the server running?' };
    }
}

/* ==================== SOCKET.IO ==================== */

function connectSocket() {
    if (!currentUser || !window.io) return;

    socket = io(API_BASE_URL.replace('/api', ''));

    socket.on('connect', function() {
        console.log('Socket connected');
        socket.emit('join', currentUser.id);
    });

    socket.on('balance:update', function(data) {
        if (currentUser) {
            currentUser.balance = data.balance;
            currentUser.currency = data.currency;
            updateUI();
            showToast('Balance updated!');
        }
    });

    socket.on('transaction:new', function(data) {
        showToast((data.type === 'received' ? 'Received ' : 'Sent ') + 'funds!');
        renderRecentTransactions();
        renderHistory();
    });

    socket.on('disconnect', function() {
        console.log('Socket disconnected');
    });
}

/* ==================== UTILITIES ==================== */

function safeNumber(value, fallback) {
    fallback = fallback !== undefined ? fallback : 0;
    const num = parseFloat(value);
    return isNaN(num) ? fallback : num;
}

function formatNumber(num) {
    const n = safeNumber(num, 0);
    try {
        return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
        return n.toFixed(2);
    }
}

function formatCurrency(amount) {
    const amt = safeNumber(amount, 0);
    const curr = CURRENCIES[currentCurrency] || CURRENCIES.USD;
    return curr.symbol + formatNumber(amt * curr.rate);
}

function formatUSD(amount) {
    return '$' + formatNumber(safeNumber(amount, 0));
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

/* ==================== AUTH ==================== */

function showLogin() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    if (loginForm) loginForm.classList.remove('hidden');
    if (signupForm) signupForm.classList.add('hidden');
}

function showSignup() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    if (loginForm) loginForm.classList.add('hidden');
    if (signupForm) signupForm.classList.remove('hidden');
}

async function handleLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');

    if (!usernameInput || !passwordInput) {
        showToast('Form error', 'error');
        return;
    }

    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!username || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: { username, password }
    });

    if (!result.success) {
        showToast(result.message, 'error');
        return;
    }

    // Save token
    authToken = result.token;
    localStorage.setItem('vw_token', authToken);

    // Set current user
    currentUser = {
        id: result.user.id,
        username: result.user.username,
        balance: safeNumber(result.user.balance, 0),
        email: String(result.user.email || ''),
        phone: String(result.user.phone || ''),
        avatar: String(result.user.avatar || ''),
        currency: String(result.user.currency || 'USD')
    };
    currentCurrency = currentUser.currency;

    const select = document.getElementById('currency-select');
    if (select) select.value = currentCurrency;

    const theme = localStorage.getItem('vw_theme_' + currentUser.username) || 'dark';
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    connectSocket();
    showScreen('main-screen');
    updateUI();
    showToast('Welcome back, ' + result.user.username + '!');
}

async function handleSignup() {
    const usernameInput = document.getElementById('signup-username');
    const passwordInput = document.getElementById('signup-password');
    const confirmInput = document.getElementById('signup-confirm');
    const pinInput = document.getElementById('signup-pin');

    if (!usernameInput || !passwordInput || !confirmInput || !pinInput) {
        showToast('Form error', 'error');
        return;
    }

    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    const pin = pinInput.value;

    if (password !== confirm) {
        showToast('Passwords do not match', 'error');
        return;
    }

    const result = await apiRequest('/auth/signup', {
        method: 'POST',
        body: { username, password, pin }
    });

    if (!result.success) {
        showToast(result.message, 'error');
        return;
    }

    // Auto-login after signup
    authToken = result.token;
    localStorage.setItem('vw_token', authToken);

    currentUser = {
        id: result.user.id,
        username: result.user.username,
        balance: safeNumber(result.user.balance, 0),
        email: String(result.user.email || ''),
        phone: String(result.user.phone || ''),
        avatar: String(result.user.avatar || ''),
        currency: String(result.user.currency || 'USD')
    };
    currentCurrency = 'USD';

    connectSocket();
    showScreen('main-screen');
    updateUI();
    showToast('Account created successfully!');

    usernameInput.value = '';
    passwordInput.value = '';
    confirmInput.value = '';
    pinInput.value = '';
}

function logout() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    authToken = null;
    currentUser = null;
    currentCurrency = 'USD';
    pinInput = '';
    pinCallback = null;
    localStorage.removeItem('vw_token');

    const loginUsername = document.getElementById('login-username');
    const loginPassword = document.getElementById('login-password');
    if (loginUsername) loginUsername.value = '';
    if (loginPassword) loginPassword.value = '';

    showLogin();
    showScreen('auth-screen');
}

/* ==================== NAVIGATION ==================== */

function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(function(s) { s.classList.remove('active'); });

    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    } else {
        console.error('Screen not found:', screenId);
        return;
    }

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function(n) { n.classList.remove('active'); });

    const navMap = {
        'main-screen': 0,
        'contacts-screen': 1,
        'history-screen': 2,
        'profile-screen': 3
    };

    if (navMap[screenId] !== undefined && navItems[navMap[screenId]]) {
        navItems[navMap[screenId]].classList.add('active');
    }

    if (screenId === 'main-screen') updateUI();
    if (screenId === 'history-screen') renderHistory();
    if (screenId === 'contacts-screen') renderContacts();
    if (screenId === 'profile-screen') updateProfileUI();
    if (screenId === 'receive-screen') {
        const el = document.getElementById('receive-username');
        if (el && currentUser) el.textContent = '@' + currentUser.username;
    }
    if (screenId === 'send-screen') {
        const balEl = document.getElementById('send-balance');
        const symEl = document.getElementById('send-symbol');
        if (balEl && currentUser) balEl.textContent = formatCurrency(currentUser.balance);
        if (symEl) symEl.textContent = (CURRENCIES[currentCurrency] || CURRENCIES.USD).symbol;
    }
    if (screenId === 'topup-screen') {
        const symEl = document.getElementById('topup-symbol');
        if (symEl) symEl.textContent = (CURRENCIES[currentCurrency] || CURRENCIES.USD).symbol;
    }
}

/* ==================== DASHBOARD / BALANCE ==================== */

async function updateUI() {
    if (!currentUser) return;

    // Fetch fresh user data from backend
    const result = await apiRequest('/user/profile');
    if (result.success) {
        currentUser.balance = safeNumber(result.user.balance, 0);
        currentUser.email = String(result.user.email || '');
        currentUser.phone = String(result.user.phone || '');
        currentUser.avatar = String(result.user.avatar || '');
        currentUser.currency = String(result.user.currency || 'USD');
    }

    const headerUsername = document.getElementById('header-username');
    const welcomeMsg = document.getElementById('welcome-msg');
    if (headerUsername) headerUsername.textContent = currentUser.username;
    if (welcomeMsg) welcomeMsg.textContent = getGreeting();

    const avatarImg = document.getElementById('avatar-img');
    const headerAvatar = document.getElementById('header-avatar');
    const avatarFallback = document.getElementById('avatar-fallback');

    if (avatarImg && headerAvatar) {
        if (currentUser.avatar) {
            avatarImg.src = currentUser.avatar;
            avatarImg.style.display = 'block';
            if (avatarFallback) avatarFallback.style.display = 'none';
            avatarImg.onerror = function() {
                this.style.display = 'none';
                if (avatarFallback) avatarFallback.style.display = 'flex';
            };
        } else {
            avatarImg.style.display = 'none';
            avatarImg.src = '';
            if (avatarFallback) avatarFallback.style.display = 'flex';
        }
    }

    const balance = safeNumber(currentUser.balance, 0);
    const curr = CURRENCIES[currentCurrency] || CURRENCIES.USD;
    const converted = balance * curr.rate;

    const balanceDisplay = document.getElementById('balance-display');
    const usdEquivalent = document.getElementById('usd-equivalent');

    if (balanceDisplay) {
        balanceDisplay.textContent = curr.symbol + formatNumber(converted);
    }
    if (usdEquivalent) {
        usdEquivalent.textContent = '≈ ' + formatUSD(balance) + ' USD';
    }

    renderHomeContacts();
    renderRecentTransactions();
}

async function changeCurrency() {
    const select = document.getElementById('currency-select');
    if (!select) return;

    currentCurrency = select.value || 'USD';

    await apiRequest('/user/update', {
        method: 'PUT',
        body: { currency: currentCurrency }
    });

    updateUI();
}

/* ==================== TOP UP ==================== */

function setTopupAmount(amt) {
    const input = document.getElementById('topup-amount');
    if (input) input.value = amt;
}

async function handleTopup() {
    const amountInput = document.getElementById('topup-amount');
    if (!amountInput) return;

    const amount = safeNumber(amountInput.value, 0);
    if (amount <= 0) {
        showToast('Enter a valid amount', 'error');
        return;
    }

    requestPin(async function() {
        const result = await apiRequest('/transaction/topup', {
            method: 'POST',
            body: {
                amount: amount,
                currency: currentCurrency
            }
        });

        if (!result.success) {
            showToast(result.message, 'error');
            return;
        }

        currentUser.balance = result.balance;
        amountInput.value = '';
        showScreen('main-screen');
        showToast('Top up successful!');
    });
}

/* ==================== SEND MONEY ==================== */

async function searchContacts(query) {
    const suggestions = document.getElementById('contact-suggestions');
    if (!suggestions) return;

    if (!query) {
        suggestions.innerHTML = '';
        return;
    }

    // Search via backend API
    const result = await apiRequest('/users/search?q=' + encodeURIComponent(query));

    if (!result.success || !result.users) {
        suggestions.innerHTML = '';
        return;
    }

    suggestions.innerHTML = result.users.slice(0, 5).map(function(u) {
        return '<div class="suggestion-item" onclick="selectContact(&quot;' + u.username + '&quot;)"><div class="avatar"><i class="fas fa-user"></i></div><span>' + (u.username) + '</span></div>';
    }).join('');
}

function selectContact(username) {
    const usernameInput = document.getElementById('send-username');
    if (usernameInput) usernameInput.value = username;

    const suggestions = document.getElementById('contact-suggestions');
    if (suggestions) suggestions.innerHTML = '';
}

async function initiateSend() {
    const toInput = document.getElementById('send-username');
    const amountInput = document.getElementById('send-amount');
    const noteInput = document.getElementById('send-note');

    if (!toInput || !amountInput) {
        showToast('Form error', 'error');
        return;
    }

    const toUsername = toInput.value.trim().toLowerCase();
    const amount = safeNumber(amountInput.value, 0);
    const note = noteInput ? noteInput.value.trim() : '';

    if (!toUsername) {
        showToast('Enter recipient username', 'error');
        return;
    }
    if (amount <= 0) {
        showToast('Enter a valid amount', 'error');
        return;
    }

    // Check if recipient exists
    const existsResult = await apiRequest('/users/exists/' + encodeURIComponent(toUsername));
    if (!existsResult.success || !existsResult.exists) {
        showToast('User not found', 'error');
        return;
    }

    if (toUsername === currentUser.username) {
        showToast('Cannot send to yourself', 'error');
        return;
    }

    const currentBalance = safeNumber(currentUser.balance, 0);
    const curr = CURRENCIES[currentCurrency] || CURRENCIES.USD;
    const usdAmount = amount / curr.rate;

    if (usdAmount > currentBalance) {
        showToast('Insufficient balance', 'error');
        return;
    }

    requestPin(async function() {
        const result = await apiRequest('/transaction/send', {
            method: 'POST',
            body: {
                toUsername: toUsername,
                amount: amount,
                currency: currentCurrency,
                note: note,
                pin: pinInput
            }
        });

        if (!result.success) {
            showToast(result.message, 'error');
            return;
        }

        currentUser.balance = result.balance;
        toInput.value = '';
        amountInput.value = '';
        if (noteInput) noteInput.value = '';

        showScreen('main-screen');
        showToast('Sent ' + formatCurrency(result.transaction.amount) + ' to @' + toUsername);
    });
}

/* ==================== PIN SCREEN ==================== */

function requestPin(callback) {
    pinCallback = callback;
    pinInput = '';
    updatePinDots();

    const pinError = document.getElementById('pin-error');
    const pinTitle = document.getElementById('pin-title');
    const pinSubtitle = document.getElementById('pin-subtitle');
    const pinScreen = document.getElementById('pin-screen');

    if (pinError) pinError.textContent = '';
    if (pinTitle) pinTitle.textContent = 'Enter PIN';
    if (pinSubtitle) pinSubtitle.textContent = 'Confirm your transaction';
    if (pinScreen) pinScreen.classList.add('active');
}

function enterPin(digit) {
    if (pinInput.length < 4) {
        pinInput += digit;
        updatePinDots();
        if (pinInput.length === 4) {
            setTimeout(verifyPin, 200);
        }
    }
}

function clearPin() {
    pinInput = pinInput.slice(0, -1);
    updatePinDots();
    const pinError = document.getElementById('pin-error');
    if (pinError) pinError.textContent = '';
}

function cancelPin() {
    pinInput = '';
    pinCallback = null;
    updatePinDots();
    const pinScreen = document.getElementById('pin-screen');
    const pinError = document.getElementById('pin-error');
    if (pinScreen) pinScreen.classList.remove('active');
    if (pinError) pinError.textContent = '';
}

function updatePinDots() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById('pin-dot-' + i);
        if (dot) {
            if (i <= pinInput.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        }
    }
}

function verifyPin() {
    const pinScreen = document.getElementById('pin-screen');
    if (pinScreen) pinScreen.classList.remove('active');

    const cb = pinCallback;
    pinCallback = null;

    if (cb) cb();
}

/* ==================== TRANSACTIONS ==================== */

async function renderRecentTransactions() {
    if (!currentUser) return;

    const result = await apiRequest('/transaction/recent');
    const container = document.getElementById('recent-transactions');
    if (!container) return;

    if (!result.success || !result.transactions || result.transactions.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><p>No transactions yet</p></div>';
        return;
    }

    container.innerHTML = result.transactions.map(function(tx) {
        return renderTxItem(tx);
    }).join('');
}

async function renderHistory() {
    if (!currentUser) return;

    const endpoint = currentFilter === 'all' 
        ? '/transaction/history' 
        : '/transaction/history?type=' + currentFilter;

    const result = await apiRequest(endpoint);
    const container = document.getElementById('history-list');
    if (!container) return;

    if (!result.success || !result.transactions || result.transactions.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><p>No transactions found</p></div>';
        return;
    }

    container.innerHTML = result.transactions.map(function(tx) {
        return renderTxItem(tx);
    }).join('');
}

function renderTxItem(tx) {
    if (!tx || !currentUser) return '';

    const isSent = tx.from === currentUser.username && tx.type === 'sent';
    const isTopup = tx.type === 'topup';

    let icon, title, subtitle, amountClass, amountPrefix, amount;

    if (isTopup) {
        icon = 'fa-plus';
        title = 'Top Up';
        subtitle = tx.note || 'Top up';
        amountClass = 'positive';
        amountPrefix = '+';
        amount = tx.amount;
    } else if (isSent) {
        icon = 'fa-paper-plane';
        title = 'Sent to @' + tx.to;
        subtitle = tx.note || 'Transfer';
        amountClass = 'negative';
        amountPrefix = '-';
        amount = tx.amount;
    } else {
        icon = 'fa-arrow-down';
        title = 'Received from @' + tx.from;
        subtitle = tx.note || 'Transfer';
        amountClass = 'positive';
        amountPrefix = '+';
        amount = tx.amount;
    }

    return '<div class="transaction-item">' +
        '<div class="tx-icon ' + tx.type + '"><i class="fas ' + icon + '"></i></div>' +
        '<div class="tx-details">' +
            '<div class="tx-title">' + title + '</div>' +
            '<div class="tx-subtitle">' + subtitle + ' · ' + formatDate(tx.timestamp) + '</div>' +
        '</div>' +
        '<div class="tx-amount ' + amountClass + '">' + amountPrefix + formatCurrency(amount) + '</div>' +
    '</div>';
}

function formatDate(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return 'Unknown date';
    }
}

function filterHistory(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-tab').forEach(function(t) {
        t.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    renderHistory();
}

/* ==================== CONTACTS ==================== */

function renderHomeContacts() {
    // Contacts are now stored locally per user (could be moved to backend later)
    const contacts = getLocalContacts().slice(0, 8);
    const container = document.getElementById('contacts-list');
    if (!container) return;

    if (contacts.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px 0;"><p style="font-size:12px;">No contacts yet</p></div>';
        return;
    }

    container.innerHTML = contacts.map(function(c) {
        return '<div class="contact-chip" onclick="quickSend(&quot;' + c.username + '&quot;)"><div class="avatar"><i class="fas fa-user"></i></div><span>' + c.name + '</span></div>';
    }).join('');
}

function renderContacts() {
    const searchInput = document.getElementById('contact-search');
    const search = searchInput ? searchInput.value.toLowerCase() : '';

    let contacts = getLocalContacts();
    if (search) {
        contacts = contacts.filter(function(c) {
            return c.name.toLowerCase().includes(search) || c.username.toLowerCase().includes(search);
        });
    }

    const container = document.getElementById('full-contacts-list');
    if (!container) return;

    if (contacts.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-address-book"></i><p>No contacts found</p></div>';
        return;
    }

    container.innerHTML = contacts.map(function(c) {
        return '<div class="contact-item">' +
            '<div class="avatar"><i class="fas fa-user"></i></div>' +
            '<div class="contact-info">' +
                '<div class="name">' + c.name + '</div>' +
                '<div class="username">@' + c.username + '</div>' +
            '</div>' +
            '<div class="contact-actions">' +
                '<button onclick="quickSend(&quot;' + c.username + '&quot;)"><i class="fas fa-paper-plane"></i></button>' +
                '<button class="delete" onclick="deleteContact(&quot;' + c.username + '&quot;)"><i class="fas fa-trash"></i></button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function getLocalContacts() {
    const key = 'vw_contacts_' + (currentUser ? currentUser.username : '');
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveLocalContacts(contacts) {
    const key = 'vw_contacts_' + (currentUser ? currentUser.username : '');
    try {
        localStorage.setItem(key, JSON.stringify(contacts));
    } catch (e) {
        console.error('saveLocalContacts error:', e);
    }
}

function quickSend(username) {
    const input = document.getElementById('send-username');
    if (input) input.value = username;
    showScreen('send-screen');
}

function showAddContact() {
    const modal = document.getElementById('add-contact-modal');
    if (modal) modal.classList.add('active');
}

function hideAddContact() {
    const modal = document.getElementById('add-contact-modal');
    const nameInput = document.getElementById('contact-name');
    const usernameInput = document.getElementById('contact-username');

    if (modal) modal.classList.remove('active');
    if (nameInput) nameInput.value = '';
    if (usernameInput) usernameInput.value = '';
}

async function addContact() {
    const nameInput = document.getElementById('contact-name');
    const usernameInput = document.getElementById('contact-username');

    if (!nameInput || !usernameInput) return;

    const name = nameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();

    if (!name || !username) {
        showToast('Fill in all fields', 'error');
        return;
    }

    // Verify user exists on backend
    const existsResult = await apiRequest('/users/exists/' + encodeURIComponent(username));
    if (!existsResult.success || !existsResult.exists) {
        showToast('User does not exist', 'error');
        return;
    }

    if (username === currentUser.username) {
        showToast('Cannot add yourself', 'error');
        return;
    }

    const contacts = getLocalContacts();
    if (contacts.find(function(c) { return c.username === username; })) {
        showToast('Contact already exists', 'error');
        return;
    }

    contacts.push({ name: name, username: username });
    saveLocalContacts(contacts);
    hideAddContact();
    renderContacts();
    showToast('Contact added!');
}

function deleteContact(username) {
    if (!confirm('Delete this contact?')) return;
    const contacts = getLocalContacts().filter(function(c) {
        return c.username !== username;
    });
    saveLocalContacts(contacts);
    renderContacts();
    showToast('Contact deleted');
}

/* ==================== PROFILE ==================== */

async function updateProfileUI() {
    if (!currentUser) return;

    // Fetch fresh data
    const result = await apiRequest('/user/profile');
    if (result.success) {
        currentUser.balance = safeNumber(result.user.balance, 0);
        currentUser.email = String(result.user.email || '');
        currentUser.phone = String(result.user.phone || '');
        currentUser.avatar = String(result.user.avatar || '');
    }

    const profileUsername = document.getElementById('profile-username');
    const profileJoined = document.getElementById('profile-joined');
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    const profileBalance = document.getElementById('profile-balance');

    if (profileUsername) profileUsername.textContent = currentUser.username;
    if (profileJoined) profileJoined.textContent = 'Member since ' + new Date(result.user.createdAt).toLocaleDateString();
    if (profileEmail) profileEmail.textContent = currentUser.email || 'Not set';
    if (profilePhone) profilePhone.textContent = currentUser.phone || 'Not set';
    if (profileBalance) profileBalance.textContent = formatCurrency(currentUser.balance);

    const profileImg = document.getElementById('profile-avatar-img');
    const placeholder = document.querySelector('.avatar-placeholder');

    if (profileImg) {
        if (currentUser.avatar) {
            profileImg.src = currentUser.avatar;
            profileImg.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        } else {
            profileImg.style.display = 'none';
            profileImg.src = '';
            if (placeholder) placeholder.style.display = 'flex';
        }
    }
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const result = await apiRequest('/user/update', {
            method: 'PUT',
            body: { avatar: e.target.result }
        });

        if (result.success) {
            currentUser.avatar = e.target.result;
            updateUI();
            updateProfileUI();
            showToast('Avatar updated!');
        }
    };
    reader.readAsDataURL(file);
}

function editField(field) {
    editingField = field;
    const title = field === 'email' ? 'Email Address' : 'Phone Number';
    const current = field === 'email' ? currentUser.email : currentUser.phone;

    const modalTitle = document.getElementById('edit-modal-title');
    const fieldInput = document.getElementById('edit-field-input');

    if (modalTitle) modalTitle.textContent = 'Edit ' + title;
    if (fieldInput) {
        fieldInput.value = current || '';
        fieldInput.placeholder = 'Enter ' + title.toLowerCase();
        fieldInput.type = field === 'email' ? 'email' : 'tel';
    }

    const modal = document.getElementById('edit-modal');
    if (modal) modal.classList.add('active');
}

function hideEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) modal.classList.remove('active');
    editingField = null;
}

async function saveField() {
    const fieldInput = document.getElementById('edit-field-input');
    if (!fieldInput) return;

    const value = fieldInput.value.trim();
    const updates = {};

    if (editingField === 'email') {
        updates.email = value;
    } else {
        updates.phone = value;
    }

    const result = await apiRequest('/user/update', {
        method: 'PUT',
        body: updates
    });

    if (result.success) {
        if (editingField === 'email') currentUser.email = value;
        else currentUser.phone = value;
        hideEditModal();
        updateProfileUI();
        showToast('Updated successfully!');
    }
}

function showChangePin() {
    const modal = document.getElementById('change-pin-modal');
    if (modal) modal.classList.add('active');
}

function hideChangePin() {
    const modal = document.getElementById('change-pin-modal');
    const currentPin = document.getElementById('current-pin');
    const newPin = document.getElementById('new-pin');
    const confirmPin = document.getElementById('confirm-new-pin');

    if (modal) modal.classList.remove('active');
    if (currentPin) currentPin.value = '';
    if (newPin) newPin.value = '';
    if (confirmPin) confirmPin.value = '';
}

async function saveNewPin() {
    const currentPinInput = document.getElementById('current-pin');
    const newPinInput = document.getElementById('new-pin');
    const confirmPinInput = document.getElementById('confirm-new-pin');

    if (!currentPinInput || !newPinInput || !confirmPinInput) return;

    const current = currentPinInput.value;
    const newPin = newPinInput.value;
    const confirm = confirmPinInput.value;

    if (newPin !== confirm) {
        showToast('New PINs do not match', 'error');
        return;
    }

    const result = await apiRequest('/user/change-pin', {
        method: 'PUT',
        body: { currentPin, newPin }
    });

    if (result.success) {
        hideChangePin();
        showToast('PIN changed successfully!');
    } else {
        showToast(result.message, 'error');
    }
}

function toggleDarkMode() {
    const isLight = document.documentElement.hasAttribute('data-theme');
    const themeIcon = document.getElementById('theme-icon');

    if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('vw_theme_' + currentUser.username, 'dark');
        if (themeIcon) themeIcon.className = 'fas fa-moon';
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('vw_theme_' + currentUser.username, 'light');
        if (themeIcon) themeIcon.className = 'fas fa-sun';
    }
}

function copyUsername() {
    if (!currentUser) return;

    navigator.clipboard.writeText(currentUser.username).then(function() {
        showToast('Username copied!');
    }).catch(function() {
        const ta = document.createElement('textarea');
        ta.value = currentUser.username;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Username copied!');
    });
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    const icon = toast.querySelector('i');

    if (type === 'error') {
        if (icon) icon.className = 'fas fa-exclamation-circle';
        toast.classList.add('error');
    } else {
        if (icon) icon.className = 'fas fa-check-circle';
        toast.classList.remove('error');
    }

    toast.classList.add('show');
    setTimeout(function() {
        toast.classList.remove('show');
    }, 3000);
}

/* ==================== INIT ==================== */

document.addEventListener('DOMContentLoaded', async function() {
    // Check for existing session
    if (authToken) {
        const result = await apiRequest('/auth/verify');
        if (result.success) {
            currentUser = {
                id: result.user.id,
                username: result.user.username,
                balance: safeNumber(result.user.balance, 0),
                email: String(result.user.email || ''),
                phone: String(result.user.phone || ''),
                avatar: String(result.user.avatar || ''),
                currency: String(result.user.currency || 'USD')
            };
            currentCurrency = currentUser.currency;

            const select = document.getElementById('currency-select');
            if (select) select.value = currentCurrency;

            const theme = localStorage.getItem('vw_theme_' + currentUser.username) || 'dark';
            if (theme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }

            connectSocket();
            showScreen('main-screen');
            updateUI();
            showToast('Welcome back, ' + currentUser.username + '!');
        } else {
            // Token invalid, clear it
            authToken = null;
            localStorage.removeItem('vw_token');
            showLogin();
        }
    } else {
        showLogin();
    }
});