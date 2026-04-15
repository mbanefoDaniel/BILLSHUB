// ===== Nefotech - Dashboard (API-backed) =====

document.addEventListener('DOMContentLoaded', () => {
    if (!API.isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    initDashNav();
    loadDashboard();
    initFundWallet();
    initModals();
    initButtonHandlers();
    handlePaystackCallback();
});

function initDashNav() {
    const navLinks = document.getElementById('navLinks');
    const user = DB.getCurrentUser();
    if (!navLinks || !user) return;

    navLinks.innerHTML = `
        <li><a href="index.html">Home</a></li>
        <li><a href="bills.html">Pay Bills</a></li>
        <li><a href="numbers.html">Virtual Numbers</a></li>
        <li><a href="dashboard.html" class="active"><i class="fas fa-tachometer-alt"></i> Dashboard</a></li>
        <li>
            <div class="nav-user" id="dashNavUser">
                <div class="nav-user-avatar">${user.fullName.charAt(0).toUpperCase()}</div>
                <div class="nav-user-info">
                    <span class="nav-user-name">${escapeHtml(user.fullName)}</span>
                    <span class="nav-user-balance">${formatCurrency(API.getBalance())}</span>
                </div>
                <div class="nav-dropdown" id="dashNavDropdown">
                    <a href="dashboard.html"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
                        <a href="#" id="dashLogoutBtn"><i class="fas fa-sign-out-alt"></i> Sign Out</a>
                </div>
            </div>
        </li>
    `;

    const navUser = document.getElementById('dashNavUser');
    if (navUser) {
        navUser.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('dashNavDropdown')?.classList.toggle('show');
        });
        document.addEventListener('click', () => {
            document.getElementById('dashNavDropdown')?.classList.remove('show');
        });
    }

    document.getElementById('dashLogoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    const toggle = document.querySelector('.nav-toggle');
    if (toggle) {
        toggle.addEventListener('click', () => navLinks.classList.toggle('active'));
    }
}

async function loadDashboard() {
    const user = DB.getCurrentUser();
    if (!user) return;

    // Greeting
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    document.getElementById('dashGreeting').textContent = `${greeting}, ${user.fullName.split(' ')[0]}!`;

    try {
        // Refresh user data from server
        await API.refreshUser();
        const balance = API.getBalance();
        document.getElementById('walletBalance').textContent = formatCurrency(balance);

        // Also update navbar balance and fund modal balance
        const navBal = document.querySelector('.nav-user-balance');
        if (navBal) navBal.textContent = formatCurrency(balance);
        const modalBal = document.getElementById('modalBalance');
        if (modalBal) modalBal.textContent = formatCurrency(balance);

        // Load transactions
        const txnData = await API.getTransactions(50);
        const txns = txnData.transactions;
        const billTxns = txns.filter(t => t.category === 'bill');
        const totalSpent = txns.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);

        document.getElementById('billsPaid').textContent = billTxns.length;
        document.getElementById('totalSpent').textContent = formatCurrency(totalSpent);

        loadRecentTransactions(txns.slice(0, 8));

        // Load virtual numbers
        const numData = await API.getMyNumbers();
        const numbers = numData.numbers;
        const activeNums = numbers.filter(n => n.status === 'active');
        document.getElementById('activeNumbers').textContent = activeNums.length;
        loadMyNumbers(activeNums.slice(0, 5));

        // Load notifications
        await loadNotifications();
    } catch (err) {
        console.error('Dashboard load error:', err);
        showToast('Failed to load some dashboard data', 'error');
    }
}

function loadRecentTransactions(txns) {
    const container = document.getElementById('recentTransactions');
    if (!txns.length) return;

    container.innerHTML = txns.map(t => `
        <div class="txn-item">
            <div class="txn-icon ${t.type}">
                <i class="fas fa-${getTxnIcon(t.category)}"></i>
            </div>
            <div class="txn-info">
                <strong>${escapeHtml(t.description)}</strong>
                <span>${t.provider ? escapeHtml(t.provider) + ' &bull; ' : ''}${formatDateTime(t.created_at)}</span>
            </div>
            <div class="txn-amount ${t.type === 'credit' ? 'positive' : 'negative'}">
                ${t.type === 'credit' ? '+' : '-'}${formatCurrency(t.amount)}
            </div>
            <span class="status-badge ${t.status}">${t.status}</span>
        </div>
    `).join('');
}

function loadMyNumbers(numbers) {
    const container = document.getElementById('myNumbers');
    if (!numbers.length) return;

    container.innerHTML = numbers.map(n => `
        <div class="number-item">
            <div class="number-item-info">
                <strong>${escapeHtml(n.number)}</strong>
                <span>${escapeHtml(n.country)} &bull; ${n.type} &bull; Expires ${formatDate(n.expires_at)}</span>
            </div>
            <div class="number-item-actions">
                <button class="btn btn-sm btn-outline" onclick="viewSms(${n.id})">
                    <i class="fas fa-sms"></i> View SMS
                </button>
            </div>
        </div>
    `).join('');
}

async function loadNotifications() {
    try {
        const data = await API.getNotifications();
        const notifs = data.notifications;
        const container = document.getElementById('notificationsList');
        const badge = document.getElementById('notifBadge');

        if (data.unread_count > 0 && badge) {
            badge.textContent = data.unread_count;
            badge.style.display = 'inline';
        }

        if (!notifs.length) return;

        container.innerHTML = notifs.slice(0, 10).map(n => `
            <div class="notif-item ${n.read ? '' : 'unread'}">
                <div class="notif-icon ${n.type}">
                    <i class="fas fa-${n.type === 'success' ? 'check-circle' : n.type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                </div>
                <div class="notif-info">
                    <strong>${escapeHtml(n.title)}</strong>
                    <p>${escapeHtml(n.message)}</p>
                    <span class="notif-time">${timeAgo(n.created_at)}</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Notifications error:', err);
    }
}

// ===== Fund Wallet =====
function initFundWallet() {
    const form = document.getElementById('fundForm');
    const methodSelect = document.getElementById('fundMethod');
    const cardDetails = document.getElementById('cardDetails');
    const amountInput = document.getElementById('fundAmount');

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            amountInput.value = btn.dataset.amount;
        });
    });

    if (methodSelect) {
        methodSelect.addEventListener('change', () => {
            cardDetails.style.display = methodSelect.value === 'card' ? 'block' : 'none';
        });
    }

    const cardNumber = document.getElementById('cardNumber');
    if (cardNumber) {
        cardNumber.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\s/g, '').replace(/\D/g, '');
            v = v.match(/.{1,4}/g)?.join(' ') || v;
            e.target.value = v;
        });
    }

    const cardExpiry = document.getElementById('cardExpiry');
    if (cardExpiry) {
        cardExpiry.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2);
            e.target.value = v;
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseFloat(amountInput.value);
            if (!amount || amount <= 0) return;

            const submitBtn = document.getElementById('fundSubmitBtn');
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            submitBtn.disabled = true;

            try {
                // Check if Paystack is enabled
                const config = await API.getWalletConfig();

                if (config.paystack_enabled && config.paystack_public_key) {
                    // Use Paystack Popup v2
                    const initResult = await API.initializePayment(amount);

                    if (initResult.access_code || initResult.authorization_url) {
                        if (window.PaystackPop && initResult.access_code) {
                            const popup = new PaystackPop();
                            popup.resumeTransaction(initResult.access_code, {
                                onSuccess: async function(transaction) {
                                    try {
                                        await API.verifyPayment(transaction.reference || initResult.reference);
                                        closeFundModal();
                                        form.reset();
                                        submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Funds';
                                        submitBtn.disabled = false;
                                        await loadDashboard();
                                        showToast(`₦${amount.toLocaleString()} added to wallet!`, 'success');
                                    } catch (err) {
                                        showToast('Payment verification failed. Contact support with ref: ' + initResult.reference, 'error');
                                        submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Funds';
                                        submitBtn.disabled = false;
                                    }
                                },
                                onCancel: function() {
                                    submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Funds';
                                    submitBtn.disabled = false;
                                    showToast('Payment cancelled', 'warning');
                                }
                            });
                        } else {
                            // Fallback: Redirect to Paystack checkout page
                            window.location.href = initResult.authorization_url;
                        }
                    }
                } else {
                    // Sandbox mode: direct fund
                    const result = await API.initializePayment(amount);
                    closeFundModal();
                    form.reset();
                    submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Funds';
                    submitBtn.disabled = false;
                    await loadDashboard();
                    showToast(`₦${amount.toLocaleString()} added to wallet! New balance: ${formatCurrency(result.balance)}`, 'success');
                }
            } catch (err) {
                submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Funds';
                submitBtn.disabled = false;
                showToast(err.message, 'error');
            }
        });
    }
}

function openFundModal() {
    const modal = document.getElementById('fundModal');
    const balanceEl = document.getElementById('modalBalance');
    if (balanceEl) balanceEl.textContent = formatCurrency(API.getBalance());
    if (modal) modal.classList.add('active');
}

function closeFundModal() {
    document.getElementById('fundModal')?.classList.remove('active');
}

function initButtonHandlers() {
    // Fund modal openers
    document.getElementById('addFundsBtn')?.addEventListener('click', openFundModal);
    document.getElementById('topUpBtn')?.addEventListener('click', openFundModal);
    document.getElementById('qaAddFundsBtn')?.addEventListener('click', (e) => { e.preventDefault(); openFundModal(); });
    document.getElementById('closeFundModalBtn')?.addEventListener('click', closeFundModal);

    // View all transactions
    document.getElementById('viewAllTxnBtn')?.addEventListener('click', (e) => { e.preventDefault(); showAllTransactions(e); });

    // Mark all notifications read
    document.getElementById('markAllReadBtn')?.addEventListener('click', markAllRead);
}

// Handle Paystack callback redirect on dashboard load
function handlePaystackCallback() {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const amount = params.get('amount');
    const ref = params.get('ref');

    if (payment === 'success') {
        showToast(`Payment successful! ₦${amount ? parseFloat(amount).toLocaleString() : ''} added to wallet.`, 'success');
        // Clean URL and refresh dashboard data
        window.history.replaceState({}, '', '/dashboard.html');
        loadDashboard();
    } else if (payment === 'failed') {
        showToast('Payment failed. Please try again. Ref: ' + (ref || 'N/A'), 'error');
        window.history.replaceState({}, '', '/dashboard.html');
    } else if (payment === 'error') {
        showToast('Payment error. If you were charged, contact support.', 'error');
        window.history.replaceState({}, '', '/dashboard.html');
    }
}

// ===== SMS Viewer =====
async function viewSms(numberId) {
    const container = document.getElementById('smsMessages');

    try {
        const data = await API.getNumberSms(numberId);
        const num = data.number;
        const messages = data.messages;

        if (!messages.length) {
            container.innerHTML = `
                <div class="empty-panel">
                    <i class="fas fa-sms"></i>
                    <p>No SMS messages received yet. Messages arrive automatically after purchase.</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="sms-number-header">
                    <strong>${escapeHtml(num.number)}</strong>
                    <span>${escapeHtml(num.country)}</span>
                </div>
                ${messages.map(s => `
                    <div class="sms-item">
                        <div class="sms-from">
                            <strong>${escapeHtml(s.sender)}</strong>
                            <span>${formatDateTime(s.created_at)}</span>
                        </div>
                        <div class="sms-body">
                            <p>${escapeHtml(s.message)}</p>
                            <button class="btn btn-sm btn-outline copy-btn" onclick="copyText(\`${escapeHtml(s.message).replace(/`/g, '\\`')}\`)">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                `).join('')}
            `;
        }

        document.getElementById('smsModal')?.classList.add('active');
    } catch (err) {
        showToast('Failed to load SMS messages', 'error');
    }
}

function closeSmsModal() {
    document.getElementById('smsModal')?.classList.remove('active');
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    });
}

// ===== All Transactions =====
async function showAllTransactions(e) {
    e.preventDefault();
    const container = document.getElementById('allTransactionsList');

    try {
        const data = await API.getTransactions(100);
        const txns = data.transactions;

        if (!txns.length) {
            container.innerHTML = '<p class="text-muted">No transactions found.</p>';
        } else {
            container.innerHTML = `
                <div class="transactions-table-wrapper">
                    <table class="transactions-table">
                        <thead>
                            <tr>
                                <th>Reference</th>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${txns.map(t => `
                                <tr>
                                    <td><code>${escapeHtml(t.reference)}</code></td>
                                    <td>${formatDateTime(t.created_at)}</td>
                                    <td>${escapeHtml(t.description)}</td>
                                    <td class="${t.type === 'credit' ? 'text-success' : ''}">${t.type === 'credit' ? '+' : '-'}${formatCurrency(t.amount)}</td>
                                    <td><span class="status-badge ${t.status}">${t.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        document.getElementById('allTransactionsModal')?.classList.add('active');
    } catch (err) {
        showToast('Failed to load transactions', 'error');
    }
}

function closeAllTransactions() {
    document.getElementById('allTransactionsModal')?.classList.remove('active');
}

// ===== Notifications =====
async function markAllRead() {
    try {
        await API.markAllNotificationsRead();
        await loadNotifications();
        showToast('All notifications marked as read', 'success');
    } catch (err) {
        showToast('Failed to mark notifications', 'error');
    }
}

// ===== Misc =====
function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        }
    });
}

function logout() {
    API.logout();
    window.location.href = 'index.html';
}

function getTxnIcon(category) {
    const icons = { bill: 'file-invoice-dollar', deposit: 'plus-circle', number: 'phone', bonus: 'gift' };
    return icons[category] || 'exchange-alt';
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
