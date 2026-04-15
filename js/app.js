// ===== Nefotech - Main Application (API-backed) =====

document.addEventListener('DOMContentLoaded', () => {
    updateNavForAuth();
    initNavbar();
    initScrollReveal();
    initBillsPage();
    initNumbersPage();
    initContactForm();
});

// ===== Dynamic Navbar =====
function updateNavForAuth() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const isLoggedIn = API.isLoggedIn();
    const user = isLoggedIn ? DB.getCurrentUser() : null;

    const path = window.location.pathname;
    const isHome = path.endsWith('index.html') || path.endsWith('/');
    const isBills = path.includes('bills');
    const isNumbers = path.includes('numbers');

    if (isLoggedIn && user) {
        navLinks.innerHTML = `
            <li><a href="index.html" ${isHome ? 'class="active"' : ''}>Home</a></li>
            <li><a href="bills.html" ${isBills ? 'class="active"' : ''}>Pay Bills</a></li>
            <li><a href="numbers.html" ${isNumbers ? 'class="active"' : ''}>Virtual Numbers</a></li>
            <li><a href="dashboard.html"><i class="fas fa-tachometer-alt"></i> Dashboard</a></li>
            <li>
                <div class="nav-user" id="navUser">
                    <div class="nav-user-avatar">${user.fullName.charAt(0).toUpperCase()}</div>
                    <div class="nav-user-info">
                        <span class="nav-user-name">${escapeHtml(user.fullName)}</span>
                        <span class="nav-user-balance">${formatCurrency(API.getBalance())}</span>
                    </div>
                    <div class="nav-dropdown" id="navDropdown">
                        <a href="dashboard.html"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
                        <a href="#" onclick="handleLogout(event)"><i class="fas fa-sign-out-alt"></i> Sign Out</a>
                    </div>
                </div>
            </li>
        `;

        const navUser = document.getElementById('navUser');
        if (navUser) {
            navUser.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('navDropdown')?.classList.toggle('show');
            });
            document.addEventListener('click', () => {
                document.getElementById('navDropdown')?.classList.remove('show');
            });
        }
    } else {
        navLinks.innerHTML = `
            <li><a href="index.html" ${isHome ? 'class="active"' : ''}>Home</a></li>
            <li><a href="bills.html" ${isBills ? 'class="active"' : ''}>Pay Bills</a></li>
            <li><a href="numbers.html" ${isNumbers ? 'class="active"' : ''}>Virtual Numbers</a></li>
            <li><a href="index.html#contact">Contact</a></li>
            <li><a href="login.html" class="btn btn-outline-light btn-sm">Sign In</a></li>
            <li><a href="register.html" class="btn btn-primary btn-sm">Sign Up</a></li>
        `;
    }
}

function handleLogout(e) {
    e.preventDefault();
    API.logout();
    window.location.href = 'index.html';
}

// ===== Navbar =====
function initNavbar() {
    const toggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (toggle && navLinks) {
        toggle.addEventListener('click', () => navLinks.classList.toggle('active'));
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => navLinks.classList.remove('active'));
        });
    }

    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }
    });
}

// ===== Scroll Reveal =====
function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    if (!reveals.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach(el => observer.observe(el));
}

// ===== Bills Payment Page =====
function initBillsPage() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const providerCards = document.querySelectorAll('.provider-card');
    const providerSearch = document.getElementById('providerSearch');
    const paymentForm = document.getElementById('billPaymentForm');
    const selectedDisplay = document.getElementById('selectedProviderDisplay');
    const formProviderName = document.getElementById('formProviderName');
    const changeProvider = document.getElementById('changeProvider');
    const amountInput = document.getElementById('amount');
    const paymentMethod = document.getElementById('paymentMethod');

    if (!tabBtns.length) return;

    // Update wallet option in payment method dropdown
    if (paymentMethod && API.isLoggedIn()) {
        const walletOption = paymentMethod.querySelector('option[value="wallet"]');
        if (walletOption) {
            walletOption.textContent = `Wallet Balance (${formatCurrency(API.getBalance())})`;
        }
    }

    // Load real recent bill transactions
    loadBillTransactions();

    // Category tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const category = btn.dataset.category;
            providerCards.forEach(card => {
                card.style.display = (category === 'all' || card.dataset.category === category) ? 'flex' : 'none';
            });
        });
    });

    // Provider search
    if (providerSearch) {
        providerSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            providerCards.forEach(card => {
                card.style.display = card.dataset.provider.toLowerCase().includes(query) ? 'flex' : 'none';
            });
        });
    }

    let selectedProvider = null;
    let selectedProviderId = null;
    let selectedCategory = null;

    // Provider selection
    providerCards.forEach(card => {
        card.addEventListener('click', () => {
            providerCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedProvider = card.dataset.provider;
            selectedProviderId = card.dataset.providerId || card.dataset.provider.toLowerCase().replace(/\s+/g, '');
            selectedCategory = card.dataset.category;

            if (paymentForm && selectedDisplay && formProviderName) {
                formProviderName.textContent = card.dataset.provider;
                selectedDisplay.style.display = 'none';
                paymentForm.style.display = 'block';

                // Show/hide verification button for electricity & TV
                const verifySection = document.getElementById('verifySection');
                const verifyResult = document.getElementById('verifyResult');
                const meterTypeSection = document.getElementById('meterTypeSection');
                if (verifySection) {
                    verifySection.style.display = ['electricity', 'tv'].includes(selectedCategory) ? 'block' : 'none';
                }
                if (verifyResult) verifyResult.style.display = 'none';
                if (meterTypeSection) {
                    meterTypeSection.style.display = selectedCategory === 'electricity' ? 'block' : 'none';
                }

                // Show/hide data plan selector for data category
                const planSection = document.getElementById('planSection');
                if (planSection) {
                    planSection.style.display = ['data', 'tv'].includes(selectedCategory) ? 'block' : 'none';
                    if (['data', 'tv'].includes(selectedCategory)) {
                        loadVariations(selectedProviderId, selectedCategory);
                    }
                }

                // Update account number label based on category
                const accountLabel = document.querySelector('label[for="accountNumber"]');
                if (accountLabel) {
                    const labels = {
                        electricity: 'Meter Number',
                        airtime: 'Phone Number',
                        data: 'Phone Number',
                        tv: 'Smartcard / IUC Number',
                        betting: 'Customer ID / Username',
                        education: 'Candidate Number / Email'
                    };
                    accountLabel.textContent = labels[selectedCategory] || 'Account Number';
                }
            }
        });
    });

    // Change provider
    if (changeProvider) {
        changeProvider.addEventListener('click', () => {
            providerCards.forEach(c => c.classList.remove('selected'));
            selectedProvider = null;
            selectedProviderId = null;
            selectedCategory = null;
            paymentForm.style.display = 'none';
            selectedDisplay.style.display = 'block';
        });
    }

    // Verify account helper
    async function verifyAccount() {
        const verifyBtn = document.getElementById('verifyBtn');
        const accountNum = document.getElementById('accountNumber').value.trim();
        const meterType = document.getElementById('meterType')?.value || 'prepaid';
        if (!accountNum) {
            showToast('Please enter an account number first', 'error');
            return;
        }

        if (verifyBtn) {
            verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
            verifyBtn.disabled = true;
        }

        try {
            const result = await API.verifyBillAccount(selectedProviderId, selectedCategory, accountNum, meterType);
            const verifyResult = document.getElementById('verifyResult');
            if (verifyResult) {
                verifyResult.style.display = 'block';
                verifyResult.innerHTML = `
                    <div class="verify-success">
                        <i class="fas fa-check-circle"></i>
                        <span><strong>${escapeHtml(result.customer_name)}</strong></span>
                        ${result.address ? `<br><small style="color:var(--text-muted)">${escapeHtml(result.address)}</small>` : ''}
                    </div>
                `;
            }
        } catch (err) {
            const verifyResult = document.getElementById('verifyResult');
            if (verifyResult) {
                verifyResult.style.display = 'block';
                verifyResult.innerHTML = `
                    <div class="verify-error">
                        <i class="fas fa-times-circle"></i>
                        <span>${escapeHtml(err.message)}</span>
                    </div>
                `;
            }
        } finally {
            if (verifyBtn) {
                verifyBtn.innerHTML = '<i class="fas fa-search"></i> Verify Meter/Smartcard';
                verifyBtn.disabled = false;
            }
        }
    }

    // Verify account button click
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', verifyAccount);
    }

    // Auto-verify when account number field loses focus
    const accountNumberInput = document.getElementById('accountNumber');
    if (accountNumberInput) {
        accountNumberInput.addEventListener('blur', () => {
            const val = accountNumberInput.value.trim();
            const verifySection = document.getElementById('verifySection');
            if (val.length >= 10 && verifySection && verifySection.style.display !== 'none') {
                verifyAccount();
            }
        });
    }

    // Amount update
    if (amountInput) {
        amountInput.addEventListener('input', updateBillSummary);
    }

    function updateBillSummary() {
        const amount = parseFloat(amountInput?.value) || 0;
        const fee = 100;
        const total = amount + fee;
        const el = (id) => document.getElementById(id);
        if (el('summaryAmount')) el('summaryAmount').textContent = formatCurrency(amount);
        if (el('summaryFee')) el('summaryFee').textContent = formatCurrency(fee);
        if (el('summaryTotal')) el('summaryTotal').textContent = formatCurrency(total);
    }

    // Bill payment form submit
    if (paymentForm) {
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!API.isLoggedIn()) {
                showToast('Please sign in to pay bills', 'error');
                setTimeout(() => window.location.href = 'login.html', 1500);
                return;
            }

            const amount = parseFloat(amountInput.value);
            if (!amount || amount <= 0) {
                showToast('Please enter a valid amount', 'error');
                return;
            }

            const accountNum = document.getElementById('accountNumber').value;
            const planSelect = document.getElementById('planSelect');
            const variationCode = planSelect ? planSelect.value : null;

            // Build extras for the API call
            const extras = {};
            if (variationCode) extras.variation_code = variationCode;
            if (selectedCategory === 'electricity') {
                extras.meter_type = document.getElementById('meterType')?.value || 'prepaid';
            }

            const submitBtn = paymentForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            submitBtn.disabled = true;

            try {
                const result = await API.payBill(selectedProviderId, selectedCategory, accountNum, amount, extras);

                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

                showReceipt(result.receipt);
                paymentForm.reset();
                updateBillSummary();
                loadBillTransactions();
                updateNavForAuth();
            } catch (err) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                showToast(err.message, 'error');
            }
        });
    }
}

// Load data plan / TV package variations
async function loadVariations(providerId, category) {
    const planSelect = document.getElementById('planSelect');
    if (!planSelect) return;

    planSelect.innerHTML = '<option value="">Loading plans...</option>';
    planSelect.disabled = true;

    // Map our IDs to VTpass service IDs
    const serviceMap = {
        'mtn-data': 'mtn-data', 'airtel-data': 'airtel-data',
        'glo-data': 'glo-data', '9mobile-data': 'etisalat-data',
        'spectranet': 'spectranet', 'smile': 'smile-direct',
        'dstv': 'dstv', 'gotv': 'gotv', 'startimes': 'startimes', 'showmax': 'showmax'
    };

    const serviceID = serviceMap[providerId] || providerId;

    try {
        const result = await API.getBillVariations(serviceID);
        const variations = result.variations || [];

        if (variations.length > 0) {
            planSelect.innerHTML = '<option value="">Select a plan</option>' +
                variations.map(v => {
                    const price = v.variation_amount ? ` - ${formatCurrency(parseFloat(v.variation_amount))}` : '';
                    return `<option value="${escapeHtml(v.variation_code)}" data-amount="${v.variation_amount || ''}">${escapeHtml(v.name)}${price}</option>`;
                }).join('');

            // Auto-fill amount when plan is selected
            planSelect.addEventListener('change', () => {
                const selected = planSelect.options[planSelect.selectedIndex];
                const planAmount = selected?.dataset?.amount;
                const amountInput = document.getElementById('amount');
                if (planAmount && amountInput && selected.dataset.amount !== '') {
                    amountInput.value = planAmount;
                    amountInput.dispatchEvent(new Event('input'));
                }
            });
        } else {
            planSelect.innerHTML = '<option value="">No plans available</option>';
        }
    } catch (err) {
        planSelect.innerHTML = '<option value="">Failed to load plans</option>';
    } finally {
        planSelect.disabled = false;
    }
}

function showReceipt(receipt) {
    let modal = document.getElementById('receiptModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'receiptModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    const statusClass = receipt.status === 'completed' ? 'success' : receipt.status === 'pending' ? 'warning' : 'error';
    const statusIcon = receipt.status === 'completed' ? 'fa-check-circle' : receipt.status === 'pending' ? 'fa-clock' : 'fa-times-circle';
    const statusColor = receipt.status === 'completed' ? 'var(--success)' : receipt.status === 'pending' ? 'var(--warning)' : 'var(--danger)';

    let tokenHtml = '';
    if (receipt.token) {
        tokenHtml = `
            <div class="receipt-row token-row">
                <span>Token / Pin</span>
                <strong class="token-value">${escapeHtml(receipt.token)}</strong>
                <button class="btn btn-sm btn-outline copy-token-btn" onclick="navigator.clipboard.writeText('${escapeHtml(receipt.token).replace(/'/g, "\\'")}'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied'; setTimeout(()=>this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy', 2000)">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
        `;
    }

    let feeHtml = '';
    if (receipt.service_fee) {
        feeHtml = `
            <div class="receipt-row"><span>Service Fee</span><strong>${formatCurrency(receipt.service_fee)}</strong></div>
            <div class="receipt-row"><span>Total Charged</span><strong>${formatCurrency(receipt.total_charged)}</strong></div>
        `;
    }

    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3><i class="fas ${statusIcon}" style="color:${statusColor}"></i> ${receipt.status === 'completed' ? 'Payment Successful' : receipt.status === 'pending' ? 'Payment Processing' : 'Payment Status'}</h3>
                <button class="modal-close" onclick="document.getElementById('receiptModal').classList.remove('active')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="receipt">
                    <div class="receipt-header">
                        <i class="fas fa-bolt"></i>
                        <h4>Nefotech Receipt</h4>
                    </div>
                    <div class="receipt-details">
                        <div class="receipt-row"><span>Reference</span><strong>${escapeHtml(receipt.reference)}</strong></div>
                        <div class="receipt-row"><span>Provider</span><strong>${escapeHtml(receipt.provider)}</strong></div>
                        <div class="receipt-row"><span>Category</span><strong>${escapeHtml(receipt.category)}</strong></div>
                        <div class="receipt-row"><span>Account</span><strong>${escapeHtml(receipt.account_number)}</strong></div>
                        <div class="receipt-row"><span>Amount</span><strong>${formatCurrency(receipt.amount)}</strong></div>
                        ${feeHtml}
                        ${tokenHtml}
                        <div class="receipt-row"><span>Date</span><strong>${formatDateTime(receipt.date)}</strong></div>
                        <div class="receipt-row"><span>Status</span><span class="status-badge ${statusClass}">${receipt.status}</span></div>
                    </div>
                    <div class="receipt-actions">
                        <button class="btn btn-primary btn-sm" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
                        <a href="dashboard.html" class="btn btn-outline btn-sm"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
}

async function loadBillTransactions() {
    const tbody = document.querySelector('.transactions-table tbody');
    if (!tbody || !API.isLoggedIn()) return;

    try {
        const data = await API.getBillHistory(10);
        const bills = data.bills;
        if (!bills.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:40px;">No transactions yet. Pay a bill to see it here.</td></tr>';
            return;
        }

        tbody.innerHTML = bills.map(t => {
            const meta = t.meta ? JSON.parse(t.meta) : {};
            return `
                <tr>
                    <td>${formatDate(t.created_at)}</td>
                    <td>${escapeHtml(t.provider || '')}</td>
                    <td>${escapeHtml(meta.account_number || '****')}</td>
                    <td>${formatCurrency(t.amount)}</td>
                    <td><span class="status-badge ${t.status}">${t.status}</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load bill history:', err);
    }
}

// ===== Virtual Numbers Page =====
function initNumbersPage() {
    const countrySearch = document.getElementById('countrySearch');
    const serviceFilter = document.getElementById('serviceFilter');
    const numberCards = document.querySelectorAll('.number-card');
    const buyBtns = document.querySelectorAll('.buy-btn');
    const purchaseModal = document.getElementById('purchaseModal');
    const closeModalBtn = document.getElementById('closeModal');
    const purchaseForm = document.getElementById('purchaseForm');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    if (!numberCards.length) return;

    // Update wallet option
    if (API.isLoggedIn()) {
        const walletOpt = document.querySelector('#purchasePayment option[value="wallet"]');
        if (walletOpt) walletOpt.textContent = `Wallet Balance (${formatCurrency(API.getBalance())})`;
    }

    if (countrySearch) countrySearch.addEventListener('input', filterNumbers);
    if (serviceFilter) serviceFilter.addEventListener('change', filterNumbers);

    function filterNumbers() {
        const query = (countrySearch?.value || '').toLowerCase();
        const service = serviceFilter?.value || 'all';
        numberCards.forEach(card => {
            const country = card.dataset.country || '';
            const services = card.dataset.services || '';
            card.style.display = (country.includes(query) && (service === 'all' || services.includes(service))) ? 'block' : 'none';
        });
    }

    const countryIdMap = { US: 'us', UK: 'uk', IN: 'in', DE: 'de', CA: 'ca', BR: 'br', NG: 'ng', RU: 'ru', ZA: 'za', GH: 'gh' };
    const countryNameMap = { US: 'United States', UK: 'United Kingdom', IN: 'India', DE: 'Germany', CA: 'Canada', BR: 'Brazil', NG: 'Nigeria', RU: 'Russia', ZA: 'South Africa', GH: 'Ghana' };

    let selectedPurchase = null;

    buyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!API.isLoggedIn()) {
                showToast('Please sign in to purchase numbers', 'error');
                setTimeout(() => window.location.href = 'login.html', 1500);
                return;
            }

            selectedPurchase = {
                countryKey: btn.dataset.country,
                countryId: countryIdMap[btn.dataset.country] || btn.dataset.country.toLowerCase(),
                countryName: countryNameMap[btn.dataset.country] || btn.dataset.country,
                type: btn.dataset.type,
                price: parseFloat(btn.dataset.price),
            };

            document.getElementById('modalCountry').textContent = selectedPurchase.countryName;
            document.getElementById('modalType').textContent = selectedPurchase.type.charAt(0).toUpperCase() + selectedPurchase.type.slice(1);
            document.getElementById('modalPrice').textContent = formatCurrency(selectedPurchase.price);
            purchaseModal?.classList.add('active');
        });
    });

    if (closeModalBtn && purchaseModal) {
        closeModalBtn.addEventListener('click', () => purchaseModal.classList.remove('active'));
        purchaseModal.addEventListener('click', (e) => {
            if (e.target === purchaseModal) purchaseModal.classList.remove('active');
        });
    }

    if (purchaseForm) {
        purchaseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedPurchase) return;

            const service = document.getElementById('purchaseService').value;

            const submitBtn = purchaseForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            submitBtn.disabled = true;

            try {
                const result = await API.purchaseNumber(selectedPurchase.countryId, service, selectedPurchase.type);

                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                purchaseModal.classList.remove('active');
                purchaseForm.reset();

                showNumberResult(result.number);
                updateNavForAuth();
            } catch (err) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                showToast(err.message, 'error');
            }
        });
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            showToast('All available countries are displayed.', 'success');
            loadMoreBtn.style.display = 'none';
        });
    }
}

function showNumberResult(num) {
    let modal = document.getElementById('numberResultModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'numberResultModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal" style="max-width:500px">
            <div class="modal-header">
                <h3><i class="fas fa-check-circle" style="color:var(--success)"></i> Number Activated!</h3>
                <button class="modal-close" id="closeNumberResult">&times;</button>
            </div>
            <div class="modal-body">
                <div class="number-result">
                    <div class="number-result-display">
                        <span class="result-label">Your Virtual Number</span>
                        <div class="result-number">${escapeHtml(num.number)}</div>
                        <button class="btn btn-sm btn-outline" onclick="navigator.clipboard.writeText('${num.number}'); showToast('Number copied!', 'success');">
                            <i class="fas fa-copy"></i> Copy Number
                        </button>
                    </div>
                    <div class="result-details">
                        <div class="receipt-row"><span>Country</span><strong>${escapeHtml(num.country)}</strong></div>
                        <div class="receipt-row"><span>Service</span><strong>${escapeHtml(num.service)}</strong></div>
                        <div class="receipt-row"><span>Expires</span><strong>${formatDateTime(num.expires_at)}</strong></div>
                        <div class="receipt-row"><span>Status</span><span class="status-badge success" id="numResultStatus">Active</span></div>
                    </div>

                    <div class="sms-poll-section" style="margin-top:20px">
                        <h4 style="margin-bottom:10px"><i class="fas fa-sms"></i> Incoming SMS</h4>
                        <div id="smsMessagesList" style="min-height:60px">
                            <div class="sms-waiting" id="smsWaiting">
                                <i class="fas fa-spinner fa-spin"></i> Waiting for SMS...
                            </div>
                        </div>
                    </div>

                    <div class="result-actions" style="margin-top:20px; gap:10px; display:flex; flex-wrap:wrap">
                        <button class="btn btn-sm btn-outline" id="numRefreshSms" title="Check for new SMS">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button class="btn btn-sm btn-success" id="numFinishBtn">
                            <i class="fas fa-check"></i> Done
                        </button>
                        <button class="btn btn-sm btn-danger" id="numCancelBtn">
                            <i class="fas fa-times"></i> Cancel & Refund
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');

    // Close handlers
    const closeBtn = document.getElementById('closeNumberResult');
    closeBtn.addEventListener('click', () => { stopSmsPoll(); modal.classList.remove('active'); });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) { stopSmsPoll(); modal.classList.remove('active'); }
    });

    // SMS polling
    let pollInterval = null;
    const numberId = num.id;

    async function pollSms() {
        try {
            const data = await API.getNumberSms(numberId);
            const list = document.getElementById('smsMessagesList');
            const waiting = document.getElementById('smsWaiting');
            if (data.messages && data.messages.length > 0) {
                if (waiting) waiting.style.display = 'none';
                list.innerHTML = data.messages.map(m => `
                    <div class="sms-message-item" style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                            <strong style="color:var(--primary)">${escapeHtml(m.sender)}</strong>
                            <small style="color:var(--text-muted)">${formatDateTime(m.created_at)}</small>
                        </div>
                        <div style="color:var(--text-primary)">${escapeHtml(m.message)}</div>
                        ${m.code ? `<div style="margin-top:6px"><span class="token-value" style="font-size:1.1em;letter-spacing:2px">${escapeHtml(m.code)}</span>
                        <button class="btn btn-sm btn-outline" style="margin-left:8px" onclick="navigator.clipboard.writeText('${escapeHtml(m.code)}'); showToast('Code copied!', 'success')"><i class="fas fa-copy"></i></button></div>` : ''}
                    </div>
                `).join('');
            }
            // Update status
            if (data.number && data.number.status !== 'active') {
                const badge = document.getElementById('numResultStatus');
                if (badge) { badge.textContent = data.number.status; badge.className = 'status-badge ' + (data.number.status === 'completed' ? 'success' : 'warning'); }
                stopSmsPoll();
            }
        } catch (e) { /* ignore poll errors */ }
    }

    function startSmsPoll() {
        pollSms();
        pollInterval = setInterval(pollSms, 5000);
    }

    function stopSmsPoll() {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

    startSmsPoll();

    // Refresh button
    document.getElementById('numRefreshSms').addEventListener('click', () => {
        pollSms();
        showToast('Checking for SMS...', 'success');
    });

    // Finish button
    document.getElementById('numFinishBtn').addEventListener('click', async () => {
        try {
            await API.finishNumber(numberId);
            stopSmsPoll();
            const badge = document.getElementById('numResultStatus');
            if (badge) { badge.textContent = 'Completed'; badge.className = 'status-badge success'; }
            showToast('Number marked as completed', 'success');
            updateNavForAuth();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Cancel button
    document.getElementById('numCancelBtn').addEventListener('click', async () => {
        if (!confirm('Cancel this number? If no SMS was received, you will be refunded.')) return;
        try {
            const result = await API.cancelNumber(numberId);
            stopSmsPoll();
            const badge = document.getElementById('numResultStatus');
            if (badge) { badge.textContent = 'Cancelled'; badge.className = 'status-badge warning'; }
            showToast(result.message, 'success');
            updateNavForAuth();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

// ===== Contact Form =====
function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        submitBtn.disabled = true;

        const name = document.getElementById('contactName').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const subject = document.getElementById('contactSubject').value.trim();
        const message = document.getElementById('contactMessage').value.trim();

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, subject, message })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(data.message, 'success');
            form.reset();
        } catch (err) {
            showToast(err.message || 'Failed to send message. Please try again.', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ===== Toast =====
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});
