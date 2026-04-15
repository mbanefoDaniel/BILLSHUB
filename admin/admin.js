 // ===== Nefotech Admin Panel =====
const API_BASE = '/api/admin';
let token = sessionStorage.getItem('admin_token');
let adminUser = JSON.parse(sessionStorage.getItem('admin_user') || 'null');

// ===== Inactivity Timeout (30 min) =====
const ADMIN_SESSION_TIMEOUT = 30 * 60 * 1000;
let _adminInactivityTimer = null;

function _resetAdminInactivity() {
    if (_adminInactivityTimer) clearTimeout(_adminInactivityTimer);
    if (token && adminUser) {
        sessionStorage.setItem('admin_last_activity', Date.now().toString());
        _adminInactivityTimer = setTimeout(() => {
            doLogout();
            showToast('Session expired due to inactivity', 'error');
        }, ADMIN_SESSION_TIMEOUT);
    }
}

function _initAdminInactivityTracker() {
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, _resetAdminInactivity, { passive: true });
    });
    const lastActivity = parseInt(sessionStorage.getItem('admin_last_activity') || '0');
    if (lastActivity && (Date.now() - lastActivity > ADMIN_SESSION_TIMEOUT)) {
        token = null;
        adminUser = null;
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_user');
        sessionStorage.removeItem('admin_last_activity');
    }
    _resetAdminInactivity();
}

// ===== API Helper =====
async function api(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) { doLogout(); }
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    if (token && adminUser) {
        showAdmin();
        _initAdminInactivityTracker();
    } else {
        showLogin();
    }
    initLoginForm();
    initNav();
    initModals();
});

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminLayout').style.display = 'none';
}

function showAdmin() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminLayout').style.display = 'flex';
    document.getElementById('adminName').textContent = adminUser.name || 'Admin';
    document.getElementById('adminAvatar').textContent = (adminUser.name || 'A').charAt(0).toUpperCase();
    loadPage('dashboard');
}

function initLoginForm() {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        const errEl = document.getElementById('loginError');
        errEl.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('loginEmail').value,
                    password: document.getElementById('loginPassword').value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');
            if (data.user.role !== 'admin') throw new Error('Admin access required');

            token = data.token;
            adminUser = data.user;
            sessionStorage.setItem('admin_token', token);
            sessionStorage.setItem('admin_user', JSON.stringify(adminUser));
            _initAdminInactivityTracker();
            showAdmin();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
        } finally {
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            btn.disabled = false;
        }
    });
}

function doLogout() {
    token = null;
    adminUser = null;
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
    sessionStorage.removeItem('admin_last_activity');
    if (_adminInactivityTimer) clearTimeout(_adminInactivityTimer);
    showLogin();
}

// ===== Navigation =====
function initNav() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            loadPage(item.dataset.page);
            // Close sidebar on mobile
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarBackdrop').classList.remove('show');
        });
    });

    document.getElementById('toggleSidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarBackdrop').classList.toggle('show');
    });

    document.getElementById('sidebarBackdrop').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarBackdrop').classList.remove('show');
    });
}

const pageTitles = {
    dashboard: 'Dashboard',
    users: 'Users',
    transactions: 'Transactions',
    numbers: 'Virtual Numbers',
    notifications: 'Notifications',
    settings: 'Settings',
    audit: 'Audit Log'
};

function loadPage(page) {
    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.add('active');
    document.getElementById('pageTitle').textContent = pageTitles[page] || page;

    const loaders = {
        dashboard: loadDashboard,
        users: loadUsers,
        transactions: loadTransactions,
        numbers: loadNumbers,
        notifications: initNotifications,
        settings: loadSettings,
        audit: loadAudit
    };

    if (loaders[page]) loaders[page]();
}

// ===== Utility =====
function fmt(amount) {
    return '₦' + (amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d) {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
}

function esc(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function statusBadge(status) {
    const map = { active: 'success', completed: 'success', pending: 'warning', suspended: 'warning', expired: 'muted', cancelled: 'muted', banned: 'danger', failed: 'danger' };
    return `<span class="badge badge-${map[status] || 'muted'}">${status}</span>`;
}

function typeBadge(type) {
    return type === 'credit'
        ? '<span class="badge badge-success">Credit</span>'
        : '<span class="badge badge-danger">Debit</span>';
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i><span>${esc(message)}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// ===== Modals =====
function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    });

    initEditUserForm();
    initWalletForm();
    initResetPwForm();
}

function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

// ===== DASHBOARD =====
async function loadDashboard() {
    try {
        const data = await api('GET', '/stats');
        renderStats(data);
        renderTopSpenders(data.top_spenders);
        renderRecentActivity(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderStats(data) {
    const { users, transactions, numbers, wallet } = data;
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card">
            <div class="stat-card-top">
                <div class="stat-icon users"><i class="fas fa-users"></i></div>
                <span class="stat-change up">+${users.recent_signups} this week</span>
            </div>
            <div class="stat-value">${users.total.toLocaleString()}</div>
            <div class="stat-label">Total Users (${users.active} active)</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-top">
                <div class="stat-icon revenue"><i class="fas fa-naira-sign"></i></div>
                <span class="stat-change up">${fmt(transactions.recent_revenue)} this week</span>
            </div>
            <div class="stat-value">${fmt(transactions.revenue)}</div>
            <div class="stat-label">Total Revenue</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-top">
                <div class="stat-icon bills"><i class="fas fa-file-invoice-dollar"></i></div>
            </div>
            <div class="stat-value">${transactions.bills.toLocaleString()}</div>
            <div class="stat-label">Bills Paid (${fmt(transactions.deposits)} deposits)</div>
        </div>
        <div class="stat-card">
            <div class="stat-card-top">
                <div class="stat-icon numbers"><i class="fas fa-phone-volume"></i></div>
            </div>
            <div class="stat-value">${numbers.total.toLocaleString()}</div>
            <div class="stat-label">Numbers Sold (${numbers.active} active)</div>
        </div>
    `;
}

function renderTopSpenders(spenders) {
    const el = document.getElementById('topSpenders');
    if (!spenders.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-trophy"></i><p>No data yet</p></div>'; return; }
    el.innerHTML = spenders.map((s, i) => `
        <div class="spender-item">
            <div class="spender-rank">${i + 1}</div>
            <div class="user-avatar-sm">${esc(s.name).charAt(0).toUpperCase()}</div>
            <div class="spender-info">
                <strong>${esc(s.name)}</strong>
                <span>${esc(s.email)}</span>
            </div>
            <div class="spender-amount">${fmt(s.total_spent)}</div>
        </div>
    `).join('');
}

function renderRecentActivity(data) {
    const el = document.getElementById('recentActivity');
    const { charts } = data;
    if (!charts.daily_txns.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>No recent activity</p></div>'; return; }
    el.innerHTML = charts.daily_txns.slice(-7).reverse().map(d => `
        <div class="activity-item">
            <div class="activity-dot"></div>
            <div class="activity-info">
                <p><strong>${d.count}</strong> transactions worth <strong>${fmt(d.volume)}</strong></p>
                <span>${fmtDate(d.day)}</span>
            </div>
        </div>
    `).join('');
}

// ===== USERS =====
let usersPage = 0;
const USERS_LIMIT = 20;

async function loadUsers() {
    const search = document.getElementById('userSearch').value;
    const status = document.getElementById('userStatusFilter').value;
    try {
        const data = await api('GET', `/users?limit=${USERS_LIMIT}&offset=${usersPage * USERS_LIMIT}&search=${encodeURIComponent(search)}&status=${status}`);
        renderUsersTable(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Debounced search
let userSearchTimer;
document.getElementById('userSearch')?.addEventListener('input', () => { clearTimeout(userSearchTimer); userSearchTimer = setTimeout(() => { usersPage = 0; loadUsers(); }, 400); });
document.getElementById('userStatusFilter')?.addEventListener('change', () => { usersPage = 0; loadUsers(); });

function renderUsersTable(data) {
    const tbody = document.getElementById('usersTableBody');
    if (!data.users.length) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">No users found</div></td></tr>';
        document.getElementById('usersPagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = data.users.map(u => `
        <tr>
            <td>
                <div class="user-cell">
                    <div class="user-avatar-sm">${esc(u.name).charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="user-name">${esc(u.name)}</div>
                        <div class="user-email">${esc(u.email)}</div>
                    </div>
                </div>
            </td>
            <td>${esc(u.phone) || '-'}</td>
            <td><strong>${fmt(u.wallet_balance)}</strong></td>
            <td>${statusBadge(u.status)}</td>
            <td>${fmtDate(u.created_at)}</td>
            <td>
                <div class="actions-cell">
                    <button class="action-btn" title="View" onclick="viewUser(${u.id})"><i class="fas fa-eye"></i></button>
                    <button class="action-btn" title="Edit" onclick="editUser(${u.id})"><i class="fas fa-edit"></i></button>
                    <button class="action-btn" title="Adjust Wallet" onclick="adjustWallet(${u.id}, ${u.wallet_balance})"><i class="fas fa-wallet"></i></button>
                    <button class="action-btn" title="Reset Password" onclick="resetPassword(${u.id})"><i class="fas fa-key"></i></button>
                    <button class="action-btn danger" title="Delete" onclick="deleteUser(${u.id}, '${esc(u.name)}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    renderPagination('usersPagination', data.total, USERS_LIMIT, usersPage, (p) => { usersPage = p; loadUsers(); });
}

// ===== User Actions =====
async function viewUser(id) {
    try {
        const data = await api('GET', `/users/${id}`);
        const u = data.user;
        document.getElementById('userModalTitle').textContent = u.name;
        document.getElementById('userModalBody').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
                <div><span style="color:var(--text-muted);font-size:0.85rem;">Email</span><br><strong>${esc(u.email)}</strong></div>
                <div><span style="color:var(--text-muted);font-size:0.85rem;">Phone</span><br><strong>${esc(u.phone) || '-'}</strong></div>
                <div><span style="color:var(--text-muted);font-size:0.85rem;">Balance</span><br><strong style="color:var(--success);">${fmt(u.wallet_balance)}</strong></div>
                <div><span style="color:var(--text-muted);font-size:0.85rem;">Status</span><br>${statusBadge(u.status)}</div>
                <div><span style="color:var(--text-muted);font-size:0.85rem;">Role</span><br><strong>${u.role}</strong></div>
                <div><span style="color:var(--text-muted);font-size:0.85rem;">Joined</span><br><strong>${fmtDateTime(u.created_at)}</strong></div>
                <div><span style="color:var(--text-muted);font-size:0.85rem;">Transactions</span><br><strong>${data.stats.transactions}</strong></div>
                <div><span style="color:var(--text-muted);font-size:0.85rem;">Total Spent</span><br><strong>${fmt(data.stats.total_spent)}</strong></div>
            </div>
            ${data.recent_transactions.length ? `
            <h4 style="color:white;margin-bottom:12px;font-size:0.95rem;">Recent Transactions</h4>
            <div style="max-height:200px;overflow-y:auto;">
                ${data.recent_transactions.map(t => `
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.88rem;">
                        <span>${esc(t.description)}</span>
                        <span style="color:${t.type === 'credit' ? 'var(--success)' : 'var(--text)'};">${t.type === 'credit' ? '+' : '-'}${fmt(t.amount)}</span>
                    </div>
                `).join('')}
            </div>` : ''}
        `;
        openModal('userModal');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function editUser(id) {
    try {
        const data = await api('GET', `/users/${id}`);
        const u = data.user;
        document.getElementById('editUserId').value = u.id;
        document.getElementById('editUserName').value = u.name;
        document.getElementById('editUserEmail').value = u.email;
        document.getElementById('editUserPhone').value = u.phone || '';
        document.getElementById('editUserStatus').value = u.status;
        document.getElementById('editUserRole').value = u.role;
        openModal('editUserModal');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function initEditUserForm() {
    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editUserId').value;
        try {
            await api('PUT', `/users/${id}`, {
                name: document.getElementById('editUserName').value,
                email: document.getElementById('editUserEmail').value,
                phone: document.getElementById('editUserPhone').value,
                status: document.getElementById('editUserStatus').value,
                role: document.getElementById('editUserRole').value
            });
            closeModal('editUserModal');
            showToast('User updated successfully');
            loadUsers();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

function adjustWallet(id, currentBalance) {
    document.getElementById('walletUserId').value = id;
    document.getElementById('walletCurrentBalance').textContent = fmt(currentBalance);
    document.getElementById('walletAmount').value = '';
    document.getElementById('walletReason').value = '';
    openModal('walletModal');
}

function initWalletForm() {
    document.getElementById('walletForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('walletUserId').value;
        try {
            await api('POST', `/users/${id}/adjust-wallet`, {
                amount: parseFloat(document.getElementById('walletAmount').value),
                reason: document.getElementById('walletReason').value
            });
            closeModal('walletModal');
            showToast('Wallet adjusted successfully');
            loadUsers();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

function resetPassword(id) {
    document.getElementById('resetPwUserId').value = id;
    document.getElementById('newPassword').value = '';
    openModal('resetPwModal');
}

function initResetPwForm() {
    document.getElementById('resetPwForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('resetPwUserId').value;
        try {
            await api('POST', `/users/${id}/reset-password`, {
                new_password: document.getElementById('newPassword').value
            });
            closeModal('resetPwModal');
            showToast('Password reset successfully');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

async function deleteUser(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
    try {
        await api('DELETE', `/users/${id}`);
        showToast('User deleted');
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== TRANSACTIONS =====
let txnPage = 0;
const TXN_LIMIT = 20;

async function loadTransactions() {
    const search = document.getElementById('txnSearch').value;
    const category = document.getElementById('txnCategoryFilter').value;
    const type = document.getElementById('txnTypeFilter').value;
    try {
        const data = await api('GET', `/transactions?limit=${TXN_LIMIT}&offset=${txnPage * TXN_LIMIT}&search=${encodeURIComponent(search)}&category=${category}&type=${type}`);
        renderTxnTable(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

let txnSearchTimer;
document.getElementById('txnSearch')?.addEventListener('input', () => { clearTimeout(txnSearchTimer); txnSearchTimer = setTimeout(() => { txnPage = 0; loadTransactions(); }, 400); });
document.getElementById('txnCategoryFilter')?.addEventListener('change', () => { txnPage = 0; loadTransactions(); });
document.getElementById('txnTypeFilter')?.addEventListener('change', () => { txnPage = 0; loadTransactions(); });

function renderTxnTable(data) {
    const tbody = document.getElementById('txnTableBody');
    if (!data.transactions.length) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">No transactions found</div></td></tr>';
        document.getElementById('txnPagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = data.transactions.map(t => `
        <tr>
            <td><code style="font-size:0.78rem;background:rgba(108,92,231,0.1);padding:2px 6px;border-radius:4px;color:var(--primary-light);">${esc(t.reference).substring(0, 16)}</code></td>
            <td>
                <div class="user-cell">
                    <div class="user-avatar-sm">${esc(t.user_name || '?').charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="user-name">${esc(t.user_name)}</div>
                        <div class="user-email">${esc(t.user_email)}</div>
                    </div>
                </div>
            </td>
            <td>${typeBadge(t.type)}</td>
            <td><span class="badge badge-info">${t.category}</span></td>
            <td style="font-weight:700;color:${t.type === 'credit' ? 'var(--success)' : 'var(--text)'};">${t.type === 'credit' ? '+' : '-'}${fmt(t.amount)}</td>
            <td>${statusBadge(t.status)}</td>
            <td>${fmtDate(t.created_at)}</td>
            <td>
                <div class="actions-cell">
                    <button class="action-btn" title="Complete" onclick="updateTxnStatus(${t.id}, 'completed')"><i class="fas fa-check"></i></button>
                    <button class="action-btn danger" title="Fail" onclick="updateTxnStatus(${t.id}, 'failed')"><i class="fas fa-times"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    renderPagination('txnPagination', data.total, TXN_LIMIT, txnPage, (p) => { txnPage = p; loadTransactions(); });
}

async function updateTxnStatus(id, status) {
    try {
        await api('PUT', `/transactions/${id}`, { status });
        showToast(`Transaction marked as ${status}`);
        loadTransactions();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== VIRTUAL NUMBERS =====
let numPage = 0;
const NUM_LIMIT = 20;

async function loadNumbers() {
    const search = document.getElementById('numSearch').value;
    const status = document.getElementById('numStatusFilter').value;
    try {
        const data = await api('GET', `/numbers?limit=${NUM_LIMIT}&offset=${numPage * NUM_LIMIT}&search=${encodeURIComponent(search)}&status=${status}`);
        renderNumTable(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

let numSearchTimer;
document.getElementById('numSearch')?.addEventListener('input', () => { clearTimeout(numSearchTimer); numSearchTimer = setTimeout(() => { numPage = 0; loadNumbers(); }, 400); });
document.getElementById('numStatusFilter')?.addEventListener('change', () => { numPage = 0; loadNumbers(); });

function renderNumTable(data) {
    const tbody = document.getElementById('numTableBody');
    if (!data.numbers.length) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">No virtual numbers found</div></td></tr>';
        document.getElementById('numPagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = data.numbers.map(n => `
        <tr>
            <td><strong style="font-family:monospace;color:white;">${esc(n.number)}</strong></td>
            <td>${esc(n.country)}</td>
            <td>
                <div class="user-cell">
                    <div class="user-avatar-sm">${esc(n.user_name || '?').charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="user-name">${esc(n.user_name)}</div>
                        <div class="user-email">${esc(n.user_email)}</div>
                    </div>
                </div>
            </td>
            <td>${esc(n.service)}</td>
            <td><span class="badge badge-info">${n.sms_count || 0}</span></td>
            <td>${statusBadge(n.status)}</td>
            <td>${fmtDate(n.expires_at)}</td>
            <td>
                <div class="actions-cell">
                    <button class="action-btn" title="Expire" onclick="updateNumStatus(${n.id}, 'expired')"><i class="fas fa-clock"></i></button>
                    <button class="action-btn danger" title="Cancel" onclick="updateNumStatus(${n.id}, 'cancelled')"><i class="fas fa-ban"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    renderPagination('numPagination', data.total, NUM_LIMIT, numPage, (p) => { numPage = p; loadNumbers(); });
}

async function updateNumStatus(id, status) {
    try {
        await api('PUT', `/numbers/${id}`, { status });
        showToast(`Number marked as ${status}`);
        loadNumbers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== NOTIFICATIONS =====
let notifInited = false;
function initNotifications() {
    if (notifInited) return;
    notifInited = true;

    const form = document.getElementById('broadcastForm');
    const titleInput = document.getElementById('notifTitle');
    const msgInput = document.getElementById('notifMessage');
    const preview = document.getElementById('broadcastPreview');

    function updatePreview() {
        const t = titleInput.value;
        const m = msgInput.value;
        if (t || m) {
            preview.style.display = 'block';
            document.getElementById('previewTitle').textContent = t || '(No title)';
            document.getElementById('previewMsg').textContent = m || '(No message)';
        } else {
            preview.style.display = 'none';
        }
    }

    titleInput.addEventListener('input', updatePreview);
    msgInput.addEventListener('input', updatePreview);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('broadcastBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        btn.disabled = true;

        try {
            const result = await api('POST', '/notifications/broadcast', {
                title: titleInput.value,
                message: msgInput.value,
                type: document.getElementById('notifType').value
            });
            showToast(result.message);
            form.reset();
            preview.style.display = 'none';
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Broadcast';
            btn.disabled = false;
        }
    });
}

// ===== SETTINGS =====
async function loadSettings() {
    try {
        const data = await api('GET', '/settings');
        const s = data.settings;
        document.getElementById('setSiteName').value = s.site_name || '';
        document.getElementById('setCurrency').value = s.currency || 'NGN';
        document.getElementById('setCurrencySymbol').value = s.currency_symbol || '₦';
        document.getElementById('setWelcome').value = s.welcome_bonus || '';
        document.getElementById('setFee').value = s.service_fee || '';
        document.getElementById('setMaxDeposit').value = s.max_deposit || '';
    } catch (err) {
        showToast(err.message, 'error');
    }

    // Init form only once
    if (!document.getElementById('settingsForm').dataset.inited) {
        document.getElementById('settingsForm').dataset.inited = 'true';
        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveSettingsBtn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            btn.disabled = true;
            try {
                await api('PUT', '/settings', {
                    settings: {
                        site_name: document.getElementById('setSiteName').value,
                        currency: document.getElementById('setCurrency').value,
                        currency_symbol: document.getElementById('setCurrencySymbol').value,
                        welcome_bonus: document.getElementById('setWelcome').value,
                        service_fee: document.getElementById('setFee').value,
                        max_deposit: document.getElementById('setMaxDeposit').value
                    }
                });
                showToast('Settings saved successfully');
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                btn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
                btn.disabled = false;
            }
        });
    }
}

// ===== AUDIT LOG =====
let auditPage = 0;
const AUDIT_LIMIT = 30;

async function loadAudit() {
    try {
        const data = await api('GET', `/audit-log?limit=${AUDIT_LIMIT}&offset=${auditPage * AUDIT_LIMIT}`);
        renderAuditTable(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderAuditTable(data) {
    const tbody = document.getElementById('auditTableBody');
    if (!data.logs.length) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">No audit log entries</div></td></tr>';
        document.getElementById('auditPagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = data.logs.map(l => {
        let details = '';
        try { details = JSON.stringify(JSON.parse(l.details), null, 0).substring(0, 80); } catch { details = l.details || ''; }
        return `
        <tr>
            <td><div class="user-name">${esc(l.admin_name)}</div><div class="user-email">${esc(l.admin_email)}</div></td>
            <td><span class="badge badge-info">${esc(l.action)}</span></td>
            <td>${esc(l.target_type || '')} ${l.target_id ? '#' + l.target_id : ''}</td>
            <td style="font-size:0.8rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(details)}">${esc(details)}</td>
            <td>${fmtDateTime(l.created_at)}</td>
        </tr>
    `;}).join('');

    renderPagination('auditPagination', data.total, AUDIT_LIMIT, auditPage, (p) => { auditPage = p; loadAudit(); });
}

// ===== PAGINATION HELPER =====
function renderPagination(containerId, total, limit, currentPage, onPageChange) {
    const container = document.getElementById(containerId);
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const start = currentPage * limit + 1;
    const end = Math.min((currentPage + 1) * limit, total);

    let btns = '';
    btns += `<button class="page-btn" ${currentPage === 0 ? 'disabled' : ''} data-p="${currentPage - 1}"><i class="fas fa-chevron-left"></i></button>`;

    for (let i = 0; i < totalPages && i < 7; i++) {
        let p;
        if (totalPages <= 7) {
            p = i;
        } else if (currentPage < 3) {
            p = i;
        } else if (currentPage > totalPages - 4) {
            p = totalPages - 7 + i;
        } else {
            p = currentPage - 3 + i;
        }
        btns += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-p="${p}">${p + 1}</button>`;
    }

    btns += `<button class="page-btn" ${currentPage >= totalPages - 1 ? 'disabled' : ''} data-p="${currentPage + 1}"><i class="fas fa-chevron-right"></i></button>`;

    container.innerHTML = `
        <div class="pagination-info">Showing ${start}-${end} of ${total}</div>
        <div class="pagination-btns">${btns}</div>
    `;

    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            onPageChange(parseInt(btn.dataset.p));
        });
    });
}
