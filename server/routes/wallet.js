const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const paystack = require('../services/paystack');

const router = express.Router();

// Check if Paystack is configured
function isPaystackEnabled() {
    return !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PUBLIC_KEY);
}

// GET /api/wallet/balance
router.get('/balance', authenticate, (req, res) => {
    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
    res.json({ balance: user.wallet_balance });
});

// GET /api/wallet/config - Return Paystack public key for frontend
router.get('/config', authenticate, (req, res) => {
    res.json({
        paystack_enabled: isPaystackEnabled(),
        paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || null
    });
});

// POST /api/wallet/initialize - Initialize Paystack payment
router.post('/initialize', authenticate, async (req, res) => {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    if (amount > 5000000) {
        return res.status(400).json({ error: 'Maximum single deposit is ₦5,000,000' });
    }

    const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);

    if (!isPaystackEnabled()) {
        // Sandbox mode: simulate a successful payment directly
        const ref = 'FND-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

        const updateBalance = db.transaction(() => {
            db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amount, req.user.id);
            db.prepare(
                'INSERT INTO transactions (user_id, type, category, description, amount, reference, status, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(req.user.id, 'credit', 'deposit', 'Wallet funded (sandbox mode)', amount, ref, 'completed',
                JSON.stringify({ mode: 'sandbox' }));
            db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(
                req.user.id, 'success', 'Wallet Funded', `₦${amount.toLocaleString()} has been added to your wallet.`
            );
        });
        updateBalance();

        const updatedUser = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
        return res.json({
            message: 'Wallet funded successfully (sandbox)',
            sandbox: true,
            balance: updatedUser.wallet_balance,
            reference: ref
        });
    }

    try {
        const amountInKobo = Math.round(amount * 100);
        const callbackUrl = `${req.protocol}://${req.get('host')}/api/wallet/callback`;

        const result = await paystack.initializeTransaction(
            user.email,
            amountInKobo,
            {
                user_id: req.user.id,
                amount_naira: amount
            },
            callbackUrl
        );

        // Store pending transaction
        const ref = result.data.reference;
        db.prepare(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference, status, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            req.user.id, 'credit', 'deposit',
            'Wallet funding via Paystack',
            amount, ref, 'pending',
            JSON.stringify({ paystack_ref: ref, access_code: result.data.access_code })
        );

        res.json({
            message: 'Payment initialized',
            authorization_url: result.data.authorization_url,
            access_code: result.data.access_code,
            reference: ref
        });
    } catch (err) {
        console.error('Paystack init error:', err.message);
        res.status(500).json({ error: 'Failed to initialize payment. Please try again.' });
    }
});

// GET /api/wallet/callback - Paystack redirects here after payment
router.get('/callback', async (req, res) => {
    const { reference, trxref } = req.query;
    const ref = reference || trxref;

    if (!ref) {
        return res.redirect('/dashboard.html?payment=error&msg=no_reference');
    }

    try {
        if (isPaystackEnabled()) {
            const result = await paystack.verifyTransaction(ref);

            if (result.data.status === 'success') {
                const amountInNaira = result.data.amount / 100;
                const meta = result.data.metadata;
                const userId = meta?.user_id;

                if (userId) {
                    // Credit wallet
                    const existingTxn = db.prepare('SELECT * FROM transactions WHERE reference = ?').get(ref);

                    if (existingTxn && existingTxn.status === 'pending') {
                        db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amountInNaira, userId);
                        db.prepare('UPDATE transactions SET status = ? WHERE reference = ?').run('completed', ref);
                        db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(
                            userId, 'success', 'Wallet Funded',
                            `₦${amountInNaira.toLocaleString()} has been added to your wallet via Paystack.`
                        );
                    }
                }

                return res.redirect(`/dashboard.html?payment=success&amount=${amountInNaira}&ref=${ref}`);
            } else {
                db.prepare('UPDATE transactions SET status = ? WHERE reference = ?').run('failed', ref);
                return res.redirect(`/dashboard.html?payment=failed&ref=${ref}`);
            }
        }

        res.redirect('/dashboard.html?payment=success');
    } catch (err) {
        console.error('Paystack callback error:', err.message);
        res.redirect('/dashboard.html?payment=error');
    }
});

// POST /api/wallet/verify - Verify transaction from frontend (inline popup flow)
router.post('/verify', authenticate, async (req, res) => {
    const { reference } = req.body;

    if (!reference) {
        return res.status(400).json({ error: 'Reference is required' });
    }

    if (!isPaystackEnabled()) {
        return res.json({ status: 'success', message: 'Sandbox mode' });
    }

    try {
        const result = await paystack.verifyTransaction(reference);

        if (result.data.status === 'success') {
            const amountInNaira = result.data.amount / 100;

            const existingTxn = db.prepare('SELECT * FROM transactions WHERE reference = ?').get(reference);

            if (existingTxn && existingTxn.status === 'pending') {
                db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amountInNaira, req.user.id);
                db.prepare('UPDATE transactions SET status = ? WHERE reference = ?').run('completed', reference);
                db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(
                    req.user.id, 'success', 'Wallet Funded',
                    `₦${amountInNaira.toLocaleString()} has been added to your wallet via Paystack.`
                );
            }

            const updatedUser = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
            res.json({
                status: 'success',
                amount: amountInNaira,
                balance: updatedUser.wallet_balance,
                reference
            });
        } else {
            db.prepare('UPDATE transactions SET status = ? WHERE reference = ?').run('failed', reference);
            res.status(400).json({ status: 'failed', message: 'Payment was not successful' });
        }
    } catch (err) {
        console.error('Paystack verify error:', err.message);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// POST /api/wallet/fund - Legacy/sandbox wallet funding (keeps backward compat)
router.post('/fund', authenticate, (req, res) => {
    const { amount, card_last4 } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    if (amount > 5000000) {
        return res.status(400).json({ error: 'Maximum single deposit is ₦5,000,000' });
    }

    // If Paystack is enabled, redirect to initialization flow
    if (isPaystackEnabled()) {
        return res.status(400).json({
            error: 'Please use the Paystack checkout to fund your wallet',
            use_paystack: true
        });
    }

    const ref = 'FND-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

    const updateBalance = db.transaction(() => {
        db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amount, req.user.id);

        db.prepare(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
            req.user.id, 'credit', 'deposit',
            `Wallet funded via card ending ${card_last4 || '****'}`,
            amount, ref,
            JSON.stringify({ card_last4: card_last4 || '****' })
        );

        db.prepare(
            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
        ).run(req.user.id, 'success', 'Wallet Funded', `₦${amount.toLocaleString()} has been added to your wallet.`);
    });

    updateBalance();

    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
    res.json({ message: 'Wallet funded successfully', balance: user.wallet_balance, reference: ref });
});

// GET /api/wallet/transactions
router.get('/transactions', authenticate, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const category = req.query.category;

    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [req.user.id];

    if (category) {
        query += ' AND category = ?';
        params.push(category);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const transactions = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(req.user.id);

    res.json({ transactions, total: total.count, limit, offset });
});

module.exports = router;
