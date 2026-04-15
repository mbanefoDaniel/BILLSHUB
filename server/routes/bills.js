const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const vtpass = require('../services/vtpass');

const router = express.Router();

const BILL_PROVIDERS = {
    electricity: [
        { id: 'ikedc', name: 'IKEDC (Ikeja Electric)', icon: 'fa-bolt', vtpass: 'ikeja-electric' },
        { id: 'ekedc', name: 'EKEDC (Eko Electric)', icon: 'fa-plug', vtpass: 'eko-electric' },
        { id: 'aedc', name: 'AEDC (Abuja Electric)', icon: 'fa-bolt', vtpass: 'abuja-electric' },
        { id: 'phedc', name: 'PHEDC (Port Harcourt)', icon: 'fa-plug', vtpass: 'portharcourt-electric' },
        { id: 'ibedc', name: 'IBEDC (Ibadan Electric)', icon: 'fa-bolt', vtpass: 'ibadan-electric' },
        { id: 'kedco', name: 'KEDCO (Kano Electric)', icon: 'fa-plug', vtpass: 'kaduna-electric' }
    ],
    airtime: [
        { id: 'mtn', name: 'MTN Nigeria', icon: 'fa-signal', vtpass: 'mtn' },
        { id: 'airtel', name: 'Airtel Nigeria', icon: 'fa-signal', vtpass: 'airtel' },
        { id: 'glo', name: 'Glo Mobile', icon: 'fa-signal', vtpass: 'glo' },
        { id: '9mobile', name: '9mobile', icon: 'fa-signal', vtpass: 'etisalat' }
    ],
    data: [
        { id: 'mtn-data', name: 'MTN Data', icon: 'fa-wifi', vtpass: 'mtn-data' },
        { id: 'airtel-data', name: 'Airtel Data', icon: 'fa-wifi', vtpass: 'airtel-data' },
        { id: 'glo-data', name: 'Glo Data', icon: 'fa-wifi', vtpass: 'glo-data' },
        { id: '9mobile-data', name: '9mobile Data', icon: 'fa-wifi', vtpass: 'etisalat-data' },
        { id: 'spectranet', name: 'Spectranet', icon: 'fa-globe', vtpass: 'spectranet' },
        { id: 'smile', name: 'Smile 4G', icon: 'fa-globe', vtpass: 'smile-direct' }
    ],
    tv: [
        { id: 'dstv', name: 'DStv', icon: 'fa-tv', vtpass: 'dstv' },
        { id: 'gotv', name: 'GOtv', icon: 'fa-tv', vtpass: 'gotv' },
        { id: 'startimes', name: 'StarTimes', icon: 'fa-satellite-dish', vtpass: 'startimes' },
        { id: 'showmax', name: 'Showmax', icon: 'fa-play', vtpass: 'showmax' }
    ],
    betting: [
        { id: 'bet9ja', name: 'Bet9ja', icon: 'fa-futbol', vtpass: 'bet9ja' },
        { id: 'sportybet', name: 'SportyBet', icon: 'fa-futbol', vtpass: null },
        { id: 'betking', name: 'BetKing', icon: 'fa-futbol', vtpass: null },
        { id: '1xbet', name: '1xBet', icon: 'fa-futbol', vtpass: null }
    ],
    education: [
        { id: 'waec', name: 'WAEC Result Checker', icon: 'fa-graduation-cap', vtpass: 'waec' },
        { id: 'jamb', name: 'JAMB', icon: 'fa-graduation-cap', vtpass: 'jamb' },
        { id: 'neco', name: 'NECO', icon: 'fa-book', vtpass: null }
    ]
};

// Flatten all providers for quick lookup
function findProvider(providerId, category) {
    const providers = BILL_PROVIDERS[category] || [];
    let provider = providers.find(p => p.id === providerId);
    if (!provider) {
        provider = providers.find(p => p.name.toLowerCase() === providerId.toLowerCase());
    }
    return provider;
}

// Check if VTpass integration is enabled
function isVTpassEnabled() {
    return !!(process.env.VTPASS_API_KEY && process.env.VTPASS_SECRET_KEY);
}

// GET /api/bills/providers
router.get('/providers', (req, res) => {
    const category = req.query.category;
    if (category && BILL_PROVIDERS[category]) {
        return res.json({ providers: BILL_PROVIDERS[category] });
    }
    res.json({ providers: BILL_PROVIDERS });
});

// POST /api/bills/verify - Verify meter/smartcard number before payment
router.post('/verify', authenticate, async (req, res) => {
    const { provider_id, category, account_number, type } = req.body;

    if (!provider_id || !category || !account_number) {
        return res.status(400).json({ error: 'Provider, category, and account number are required' });
    }

    if (!isVTpassEnabled()) {
        // Sandbox mode: return mock verification
        return res.json({
            verified: true,
            customer_name: 'Test Customer',
            account_number,
            message: 'Sandbox mode - verification simulated'
        });
    }

    const provider = findProvider(provider_id, category);
    if (!provider || !provider.vtpass) {
        return res.status(400).json({ error: 'Provider not supported for verification' });
    }

    try {
        const result = await vtpass.verifyAccount(provider.vtpass, account_number, type || 'prepaid');
        console.log('VTpass verify response:', JSON.stringify(result, null, 2));

        if (result.code === '000') {
            const content = result.content || {};
            const customerName = content.Customer_Name || content.customerName || content.customer_name || content.Customer || null;
            res.json({
                verified: true,
                customer_name: customerName || 'Customer Verified',
                account_number,
                address: content.Address || content.address || null,
                meter_type: type || null
            });
        } else {
            res.status(400).json({
                verified: false,
                error: result.response_description || 'Verification failed. Check the account number.'
            });
        }
    } catch (err) {
        console.error('Verification error:', err.message);
        res.status(500).json({ error: err.message || 'Verification service unavailable' });
    }
});

// GET /api/bills/variations/:serviceID - Get data plans / TV packages
router.get('/variations/:serviceID', authenticate, async (req, res) => {
    const { serviceID } = req.params;

    if (!isVTpassEnabled()) {
        // Return mock variations for sandbox
        return res.json({
            variations: [
                { variation_code: 'plan1', name: '1GB - 30 days', variation_amount: 500, fixedPrice: 'Yes' },
                { variation_code: 'plan2', name: '2GB - 30 days', variation_amount: 1000, fixedPrice: 'Yes' },
                { variation_code: 'plan3', name: '5GB - 30 days', variation_amount: 2000, fixedPrice: 'Yes' }
            ]
        });
    }

    try {
        const result = await vtpass.getVariations(serviceID);
        res.json({
            variations: result.content?.varations || result.content?.variations || []
        });
    } catch (err) {
        console.error('Variations error:', err.message);
        res.status(500).json({ error: 'Failed to fetch service plans' });
    }
});

// POST /api/bills/pay - Process bill payment via VTpass
router.post('/pay', authenticate, async (req, res) => {
    const { provider_id, category, account_number, amount, phone, variation_code, meter_type } = req.body;

    if (!provider_id || !category || !account_number || !amount) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    const validCategories = ['electricity', 'airtime', 'data', 'tv', 'betting', 'education'];
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }

    const provider = findProvider(provider_id, category);
    const providerName = provider ? provider.name : provider_id;

    // Get service fee from settings
    const feeSetting = db.prepare("SELECT value FROM settings WHERE key = 'service_fee'").get();
    const serviceFee = feeSetting ? parseFloat(feeSetting.value) : 100;
    const totalCharge = numAmount + serviceFee;

    // Check wallet balance
    const user = db.prepare('SELECT wallet_balance, email, phone FROM users WHERE id = ?').get(req.user.id);
    if (user.wallet_balance < totalCharge) {
        return res.status(400).json({
            error: `Insufficient balance. You need ₦${totalCharge.toLocaleString()} (₦${numAmount.toLocaleString()} + ₦${serviceFee.toLocaleString()} fee)`
        });
    }

    const internalRef = 'BILL-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    let vtpassResult = null;
    let vtpassRequestId = null;
    let paymentStatus = 'completed';
    let tokenOrPin = null;

    // If VTpass is configured, make real API call
    if (isVTpassEnabled() && provider && provider.vtpass) {
        try {
            const serviceID = provider.vtpass;
            const userPhone = phone || user.phone || '08000000000';

            switch (category) {
                case 'airtime':
                    vtpassResult = await vtpass.buyAirtime(serviceID, account_number, numAmount);
                    break;

                case 'data':
                    if (!variation_code) {
                        return res.status(400).json({ error: 'Please select a data plan' });
                    }
                    vtpassResult = await vtpass.buyData(serviceID, account_number, variation_code, numAmount);
                    break;

                case 'electricity':
                    vtpassResult = await vtpass.payElectricity(
                        serviceID, account_number, numAmount, userPhone, meter_type || 'prepaid'
                    );
                    // Extract token if electricity
                    if (vtpassResult.purchased_code) {
                        tokenOrPin = vtpassResult.purchased_code;
                    } else if (vtpassResult.content?.transactions?.product_name) {
                        tokenOrPin = vtpassResult.token || vtpassResult.mainToken || null;
                    }
                    break;

                case 'tv':
                    if (!variation_code) {
                        return res.status(400).json({ error: 'Please select a TV package' });
                    }
                    vtpassResult = await vtpass.payTV(serviceID, account_number, variation_code, numAmount, userPhone);
                    break;

                case 'betting':
                    vtpassResult = await vtpass.fundBetting(serviceID, account_number, numAmount);
                    break;

                case 'education':
                    vtpassResult = await vtpass.buyEducation(serviceID, variation_code || serviceID, numAmount);
                    // Extract pins
                    if (vtpassResult.purchased_code) {
                        tokenOrPin = vtpassResult.purchased_code;
                    } else if (vtpassResult.cards) {
                        tokenOrPin = vtpassResult.cards.map(c => `Serial: ${c.Serial}, Pin: ${c.Pin}`).join('; ');
                    }
                    break;
            }

            vtpassRequestId = vtpassResult.request_id;

            // Check VTpass response status
            const txnStatus = vtpassResult.content?.transactions?.status || vtpassResult.response_description;
            if (txnStatus === 'failed' || vtpassResult.code === '016') {
                paymentStatus = 'failed';
                // Refund - don't deduct
                return res.status(400).json({
                    error: vtpassResult.response_description || 'Payment failed at provider. Your wallet was not charged.',
                    vtpass_code: vtpassResult.code
                });
            } else if (txnStatus === 'delivered' || vtpassResult.code === '000') {
                paymentStatus = 'completed';
            } else {
                paymentStatus = 'pending';
            }
        } catch (err) {
            console.error('VTpass payment error:', err.message);
            // Don't deduct if API call fails
            return res.status(500).json({
                error: 'Payment failed: ' + err.message + '. Your wallet was not charged.'
            });
        }
    }

    // Deduct from wallet and record transaction
    const payBill = db.transaction(() => {
        db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(totalCharge, req.user.id);

        db.prepare(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference, provider, status, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            req.user.id, 'debit', 'bill',
            `${providerName} - ${category} bill payment`,
            totalCharge, internalRef, providerName, paymentStatus,
            JSON.stringify({
                account_number,
                category,
                provider_id,
                bill_amount: numAmount,
                service_fee: serviceFee,
                vtpass_request_id: vtpassRequestId,
                vtpass_code: vtpassResult?.code || null,
                token: tokenOrPin,
                variation_code: variation_code || null,
                meter_type: meter_type || null
            })
        );

        db.prepare(
            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
        ).run(
            req.user.id,
            paymentStatus === 'completed' ? 'success' : 'warning',
            paymentStatus === 'completed' ? 'Bill Payment Successful' : 'Bill Payment Pending',
            paymentStatus === 'completed'
                ? `Your ${category} bill of ₦${numAmount.toLocaleString()} to ${providerName} has been paid.${tokenOrPin ? ' Token: ' + tokenOrPin : ''}`
                : `Your ${category} bill of ₦${numAmount.toLocaleString()} to ${providerName} is being processed.`
        );
    });

    payBill();

    const updatedUser = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);

    res.json({
        message: paymentStatus === 'completed' ? 'Bill paid successfully' : 'Payment is being processed',
        receipt: {
            reference: internalRef,
            provider: providerName,
            category,
            account_number,
            amount: numAmount,
            service_fee: serviceFee,
            total_charged: totalCharge,
            token: tokenOrPin,
            date: new Date().toISOString(),
            status: paymentStatus,
            vtpass_request_id: vtpassRequestId
        },
        balance: updatedUser.wallet_balance
    });
});

// POST /api/bills/requery - Check status of a pending transaction
router.post('/requery', authenticate, async (req, res) => {
    const { request_id, transaction_ref } = req.body;

    if (!request_id && !transaction_ref) {
        return res.status(400).json({ error: 'Provide request_id or transaction_ref' });
    }

    // Find the transaction
    let txn;
    if (transaction_ref) {
        txn = db.prepare('SELECT * FROM transactions WHERE reference = ? AND user_id = ?').get(transaction_ref, req.user.id);
    }

    const vtpassRequestId = request_id || (txn ? JSON.parse(txn.meta || '{}').vtpass_request_id : null);

    if (!vtpassRequestId) {
        return res.status(400).json({ error: 'No VTpass request ID found for this transaction' });
    }

    if (!isVTpassEnabled()) {
        return res.json({ status: 'completed', message: 'Sandbox mode' });
    }

    try {
        const result = await vtpass.queryTransaction(vtpassRequestId);
        const status = result.content?.transactions?.status;

        // Update local transaction status if changed
        if (txn && status && status !== txn.status) {
            db.prepare('UPDATE transactions SET status = ? WHERE id = ?').run(
                status === 'delivered' ? 'completed' : status,
                txn.id
            );

            if (status === 'failed' && txn.status !== 'failed') {
                // Refund
                db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(txn.amount, req.user.id);
                db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(
                    req.user.id, 'info', 'Refund Processed',
                    `₦${txn.amount.toLocaleString()} refunded for failed ${txn.provider} payment.`
                );
            }
        }

        res.json({
            status: status === 'delivered' ? 'completed' : status,
            vtpass_response: result.content?.transactions || {},
            token: result.purchased_code || result.mainToken || null
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to query transaction status' });
    }
});

// GET /api/bills/history
router.get('/history', authenticate, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const bills = db.prepare(
        'SELECT * FROM transactions WHERE user_id = ? AND category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(req.user.id, 'bill', limit, offset);

    const total = db.prepare(
        'SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND category = ?'
    ).get(req.user.id, 'bill');

    res.json({ bills, total: total.count, limit, offset });
});

module.exports = router;
