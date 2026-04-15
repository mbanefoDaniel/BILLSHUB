const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const paystack = require('../services/paystack');

const router = express.Router();

function isPaystackEnabled() {
    return !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PUBLIC_KEY);
}

// GET /api/wallet/balance
router.get('/balance', authenticate, async (req, res) => {
    try {
        const user = await db.get('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id]);
        res.json({ balance: parseFloat(user.wallet_balance) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

// GET /api/wallet/config
router.get('/config', authenticate, (req, res) => {
    res.json({
        paystack_enabled: isPaystackEnabled(),
        paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || null
    });
});

// POST /api/wallet/initialize
router.post('/initialize', authenticate, async (req, res) => {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }
    if (amount > 5000000) {
        return res.status(400).json({ error: 'Maximum single deposit is ₦5,000,000' });
    }

    try {
        const user = await db.get('SELECT email, name FROM users WHERE id = $1', [req.user.id]);

        if (!isPaystackEnabled()) {
            const ref = 'FND-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

            await db.run('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [amount, req.user.id]);
            await db.run(
                'INSERT INTO transactions (user_id, type, category, description, amount, reference, status, meta) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [req.user.id, 'credit', 'deposit', 'Wallet funded (sandbox mode)', amount, ref, 'completed', JSON.stringify({ mode: 'sandbox' })]
            );
            await db.run(
                'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
                [req.user.id, 'success', 'Wallet Funded', `₦${amount.toLocaleString()} has been added to your wallet.`]
            );

            const updatedUser = await db.get('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id]);
            return res.json({
                message: 'Wallet funded successfully (sandbox)',
                sandbox: true,
                balance: parseFloat(updatedUser.wallet_balance),
                reference: ref
            });
        }

        const amountInKobo = Math.round(amount * 100);
        const callbackUrl = `${req.protocol}://${req.get('host')}/api/wallet/callback`;

        const result = await paystack.initializeTransaction(
            user.email, amountInKobo,
            { user_id: req.user.id, amount_naira: amount },
            callbackUrl
        );

        const ref = result.data.reference;
        await db.run(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference, status, meta) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [req.user.id, 'credit', 'deposit', 'Wallet funding via Paystack', amount, ref, 'pending',
                JSON.stringify({ paystack_ref: ref, access_code: result.data.access_code })]
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

// GET /api/wallet/callback
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
                    const existingTxn = await db.get('SELECT * FROM transactions WHERE reference = $1', [ref]);
                    if (existingTxn && existingTxn.status === 'pending') {
                        await db.run('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [amountInNaira, userId]);
                        await db.run('UPDATE transactions SET status = $1 WHERE reference = $2', ['completed', ref]);
                        await db.run(
                            'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
                            [userId, 'success', 'Wallet Funded', `₦${amountInNaira.toLocaleString()} has been added to your wallet via Paystack.`]
                        );
                    }
                }
                return res.redirect(`/dashboard.html?payment=success&amount=${amountInNaira}&ref=${ref}`);
            } else {
                await db.run('UPDATE transactions SET status = $1 WHERE reference = $2', ['failed', ref]);
                return res.redirect(`/dashboard.html?payment=failed&ref=${ref}`);
            }
        }
        res.redirect('/dashboard.html?payment=success');
    } catch (err) {
        console.error('Paystack callback error:', err.message);
        res.redirect('/dashboard.html?payment=error');
    }
});

// POST /api/wallet/verify
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
            const existingTxn = await db.get('SELECT * FROM transactions WHERE reference = $1', [reference]);

            if (existingTxn && existingTxn.status === 'pending') {
                await db.run('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [amountInNaira, req.user.id]);
                await db.run('UPDATE transactions SET status = $1 WHERE reference = $2', ['completed', reference]);
                await db.run(
                    'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
                    [req.user.id, 'success', 'Wallet Funded', `₦${amountInNaira.toLocaleString()} has been added to your wallet via Paystack.`]
                );
            }

            const updatedUser = await db.get('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id]);
            res.json({ status: 'success', amount: amountInNaira, balance: parseFloat(updatedUser.wallet_balance), reference });
        } else {
            await db.run('UPDATE transactions SET status = $1 WHERE reference = $2', ['failed', reference]);
            res.status(400).json({ status: 'failed', message: 'Payment was not successful' });
        }
    } catch (err) {
        console.error('Paystack verify error:', err.message);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// POST /api/wallet/fund
router.post('/fund', authenticate, async (req, res) => {
    const { amount, card_last4 } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }
    if (amount > 5000000) {
        return res.status(400).json({ error: 'Maximum single deposit is ₦5,000,000' });
    }
    if (isPaystackEnabled()) {
        return res.status(400).json({ error: 'Please use the Paystack checkout to fund your wallet', use_paystack: true });
    }

    try {
        const ref = 'FND-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

        await db.run('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [amount, req.user.id]);
        await db.run(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference, meta) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [req.user.id, 'credit', 'deposit', `Wallet funded via card ending ${card_last4 || '****'}`, amount, ref,
                JSON.stringify({ card_last4: card_last4 || '****' })]
        );
        await db.run(
            'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
            [req.user.id, 'success', 'Wallet Funded', `₦${amount.toLocaleString()} has been added to your wallet.`]
        );

        const user = await db.get('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id]);
        res.json({ message: 'Wallet funded successfully', balance: parseFloat(user.wallet_balance), reference: ref });
    } catch (err) {
        console.error('Fund error:', err.message);
        res.status(500).json({ error: 'Failed to fund wallet' });
    }
});

// GET /api/wallet/transactions
router.get('/transactions', authenticate, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const category = req.query.category;

    try {
        let q = 'SELECT * FROM transactions WHERE user_id = $1';
        const params = [req.user.id];
        let idx = 2;

        if (category) {
            q += ` AND category = $${idx++}`;
            params.push(category);
        }

        q += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
        params.push(limit, offset);

        const transactions = await db.query(q, params);
        const total = await db.get('SELECT COUNT(*) as count FROM transactions WHERE user_id = $1', [req.user.id]);

        res.json({ transactions, total: parseInt(total.count), limit, offset });
    } catch (err) {
        console.error('Wallet transactions error:', err.message);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

module.exports = router;
