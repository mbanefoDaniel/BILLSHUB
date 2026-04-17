// ===== Nefotech - API Client =====
// Replaces localStorage with real API calls to the backend

const API_BASE = '/api';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity
let _inactivityTimer = null;

function _resetInactivityTimer() {
    if (_inactivityTimer) clearTimeout(_inactivityTimer);
    if (API.isLoggedIn()) {
        sessionStorage.setItem('Nefotech_last_activity', Date.now().toString());
        _inactivityTimer = setTimeout(() => {
            API.logout();
            window.location.href = '/login.html';
        }, SESSION_TIMEOUT);
    }
}

function _initInactivityTracker() {
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, _resetInactivityTimer, { passive: true });
    });
    // Check if session expired while tab was inactive
    const lastActivity = parseInt(sessionStorage.getItem('Nefotech_last_activity') || '0');
    if (lastActivity && (Date.now() - lastActivity > SESSION_TIMEOUT)) {
        API.clearSession();
    }
    _resetInactivityTimer();
}

const API = {
    _token: sessionStorage.getItem('Nefotech_token'),
    _user: JSON.parse(sessionStorage.getItem('Nefotech_user') || 'null'),

    // ===== HTTP helper =====
    async request(method, path, body = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (this._token) headers['Authorization'] = `Bearer ${this._token}`;

        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(API_BASE + path, opts);

        let data;
        const text = await res.text();
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            throw new Error(res.ok ? 'Invalid server response' : `Server error (${res.status})`);
        }

        if (!res.ok) {
            throw new Error(data.error || `Request failed (${res.status})`);
        }
        return data;
    },

    // ===== Auth =====
    setSession(token, user) {
        this._token = token;
        this._user = user;
        sessionStorage.setItem('Nefotech_token', token);
        sessionStorage.setItem('Nefotech_user', JSON.stringify(user));
        _initInactivityTracker();
    },

    clearSession() {
        this._token = null;
        this._user = null;
        sessionStorage.removeItem('Nefotech_token');
        sessionStorage.removeItem('Nefotech_user');
        sessionStorage.removeItem('Nefotech_last_activity');
        if (_inactivityTimer) clearTimeout(_inactivityTimer);
    },

    isLoggedIn() {
        return !!(this._token && this._user);
    },

    getCurrentUser() {
        return this._user;
    },

    getBalance() {
        return this._user ? this._user.wallet_balance : 0;
    },

    async login(email, password) {
        const data = await this.request('POST', '/auth/login', { email, password });
        this.setSession(data.token, data.user);
        return data;
    },

    async register(userData) {
        const data = await this.request('POST', '/auth/register', userData);
        this.setSession(data.token, data.user);
        return data;
    },

    logout() {
        this.clearSession();
    },

    async refreshUser() {
        try {
            const data = await this.request('GET', '/auth/me');
            this._user = data.user;
            sessionStorage.setItem('Nefotech_user', JSON.stringify(data.user));
            return data.user;
        } catch {
            this.clearSession();
            return null;
        }
    },

    // ===== Wallet =====
    async getWalletBalance() {
        const data = await this.request('GET', '/wallet/balance');
        if (this._user) this._user.wallet_balance = data.balance;
        sessionStorage.setItem('Nefotech_user', JSON.stringify(this._user));
        return data.balance;
    },

    async getWalletConfig() {
        return await this.request('GET', '/wallet/config');
    },

    async initializePayment(amount) {
        return await this.request('POST', '/wallet/initialize', { amount });
    },

    async verifyPayment(reference) {
        const data = await this.request('POST', '/wallet/verify', { reference });
        if (this._user && data.balance !== undefined) {
            this._user.wallet_balance = data.balance;
            sessionStorage.setItem('Nefotech_user', JSON.stringify(this._user));
        }
        return data;
    },

    async fundWallet(amount, card_last4) {
        const data = await this.request('POST', '/wallet/fund', { amount, card_last4 });
        if (this._user) this._user.wallet_balance = data.balance;
        sessionStorage.setItem('Nefotech_user', JSON.stringify(this._user));
        return data;
    },

    async getTransactions(limit = 20, offset = 0, category = null) {
        let path = `/wallet/transactions?limit=${limit}&offset=${offset}`;
        if (category) path += `&category=${category}`;
        return await this.request('GET', path);
    },

    // ===== Bills =====
    async getProviders(category = null) {
        let path = '/bills/providers';
        if (category) path += `?category=${category}`;
        return await this.request('GET', path);
    },

    async verifyBillAccount(provider_id, category, account_number, type) {
        return await this.request('POST', '/bills/verify', { provider_id, category, account_number, type });
    },

    async getBillVariations(serviceID) {
        return await this.request('GET', `/bills/variations/${serviceID}`);
    },

    async payBill(provider_id, category, account_number, amount, extras = {}) {
        const data = await this.request('POST', '/bills/pay', {
            provider_id, category, account_number, amount,
            ...extras
        });
        if (this._user) this._user.wallet_balance = data.balance;
        sessionStorage.setItem('Nefotech_user', JSON.stringify(this._user));
        return data;
    },

    async requeryBill(request_id, transaction_ref) {
        return await this.request('POST', '/bills/requery', { request_id, transaction_ref });
    },

    async getBillHistory(limit = 20, offset = 0) {
        return await this.request('GET', `/bills/history?limit=${limit}&offset=${offset}`);
    },

    // ===== Virtual Numbers =====
    async getCountries() {
        return await this.request('GET', '/numbers/countries');
    },

    async purchaseNumber(country_id, service, type) {
        const data = await this.request('POST', '/numbers/purchase', { country_id, service, type });
        if (this._user) this._user.wallet_balance = data.balance;
        sessionStorage.setItem('Nefotech_user', JSON.stringify(this._user));
        return data;
    },

    async getMyNumbers() {
        return await this.request('GET', '/numbers/my');
    },

    async getNumberSms(numberId) {
        return await this.request('GET', `/numbers/${numberId}/sms`);
    },

    async finishNumber(numberId) {
        return await this.request('POST', `/numbers/${numberId}/finish`);
    },

    async cancelNumber(numberId) {
        const data = await this.request('POST', `/numbers/${numberId}/cancel`);
        if (data.balance !== undefined && this._user) {
            this._user.wallet_balance = data.balance;
            sessionStorage.setItem('Nefotech_user', JSON.stringify(this._user));
        }
        return data;
    },

    // ===== Notifications =====
    async getNotifications(limit = 20) {
        return await this.request('GET', `/notifications?limit=${limit}`);
    },

    async markNotificationRead(id) {
        return await this.request('PUT', `/notifications/${id}/read`);
    },

    async markAllNotificationsRead() {
        return await this.request('PUT', '/notifications/read-all');
    },

    // ===== Password =====
    async changePassword(current_password, new_password) {
        return await this.request('PUT', '/auth/password', { current_password, new_password });
    }
};

// Start inactivity tracker if already logged in
if (API.isLoggedIn()) _initInactivityTracker();

// ===== Backward-compatible DB shim =====
// Some pages still reference DB.isLoggedIn(), DB.getCurrentUser(), etc.
const DB = {
    isLoggedIn: () => API.isLoggedIn(),
    getCurrentUser: () => {
        const u = API.getCurrentUser();
        return u ? { ...u, fullName: u.name } : null;
    },
    getBalance: () => API.getBalance(),
    logout: () => API.logout()
};

// ===== Utility functions =====
function formatCurrency(amount) {
    return '₦' + (amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
    return new Date(dateStr).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}
