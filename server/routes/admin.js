const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// ===== DASHBOARD STATS =====
router.get('/stats', async (req, res) => {
    try {
        const totalUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        const activeUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'user' AND status = 'active'");
        const suspendedUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE status = 'suspended'");
        const bannedUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE status = 'banned'");

        const totalTransactions = await db.get('SELECT COUNT(*) as count FROM transactions');
        const totalRevenue = await db.get("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'debit'");
        const totalDeposits = await db.get("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'credit' AND category = 'deposit'");
        const totalBills = await db.get("SELECT COUNT(*) as count FROM transactions WHERE category = 'bill'");

        const totalNumbers = await db.get('SELECT COUNT(*) as count FROM virtual_numbers');
        const activeNumbers = await db.get("SELECT COUNT(*) as count FROM virtual_numbers WHERE status = 'active'");
        const totalSms = await db.get('SELECT COUNT(*) as count FROM sms_messages');

        const totalWalletBalance = await db.get("SELECT COALESCE(SUM(wallet_balance), 0) as total FROM users WHERE role = 'user'");

        const recentSignups = await db.get(
            "SELECT COUNT(*) as count FROM users WHERE role = 'user' AND created_at >= NOW() - INTERVAL '7 days'"
        );

        const recentRevenue = await db.get(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'debit' AND created_at >= NOW() - INTERVAL '7 days'"
        );

        const dailyTxns = await db.query(`
            SELECT DATE(created_at) as day, COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
            FROM transactions
            WHERE created_at >= NOW() - INTERVAL '14 days'
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        `);

        const dailySignups = await db.query(`
            SELECT DATE(created_at) as day, COUNT(*) as count
            FROM users
            WHERE role = 'user' AND created_at >= NOW() - INTERVAL '14 days'
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        `);

        const topSpenders = await db.query(`
            SELECT u.id, u.name, u.email, COALESCE(SUM(t.amount), 0) as total_spent
            FROM users u
            LEFT JOIN transactions t ON t.user_id = u.id AND t.type = 'debit'
            WHERE u.role = 'user'
            GROUP BY u.id, u.name, u.email
            ORDER BY total_spent DESC
            LIMIT 5
        `);

        res.json({
            users: { total: parseInt(totalUsers.count), active: parseInt(activeUsers.count), suspended: parseInt(suspendedUsers.count), banned: parseInt(bannedUsers.count), recent_signups: parseInt(recentSignups.count) },
            transactions: { total: parseInt(totalTransactions.count), revenue: parseFloat(totalRevenue.total), deposits: parseFloat(totalDeposits.total), bills: parseInt(totalBills.count), recent_revenue: parseFloat(recentRevenue.total) },
            numbers: { total: parseInt(totalNumbers.count), active: parseInt(activeNumbers.count), total_sms: parseInt(totalSms.count) },
            wallet: { total_balance: parseFloat(totalWalletBalance.total) },
            charts: { daily_txns: dailyTxns, daily_signups: dailySignups },
            top_spenders: topSpenders
        });
    } catch (err) {
        console.error('Stats error:', err.message);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ===== USER MANAGEMENT =====
router.get('/users', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const role = req.query.role || '';
    const sortBy = ['name', 'email', 'wallet_balance', 'created_at'].includes(req.query.sort) ? req.query.sort : 'created_at';
    const sortDir = req.query.dir === 'asc' ? 'ASC' : 'DESC';

    let where = '1=1';
    const params = [];
    let paramIdx = 1;

    if (search) {
        where += ` AND (name LIKE $${paramIdx} OR email LIKE $${paramIdx + 1} OR phone LIKE $${paramIdx + 2})`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        paramIdx += 3;
    }
    if (status) {
        where += ` AND status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
    }
    if (role) {
        where += ` AND role = $${paramIdx}`;
        params.push(role);
        paramIdx++;
    }

    try {
        const total = await db.get(`SELECT COUNT(*) as count FROM users WHERE ${where}`, params);
        const usersParams = [...params, limit, offset];
        const users = await db.query(
            `SELECT id, name, email, phone, wallet_balance, role, status, created_at FROM users WHERE ${where} ORDER BY ${sortBy} ${sortDir} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
            usersParams
        );
        res.json({ users, total: parseInt(total.count), limit, offset });
    } catch (err) {
        console.error('Users list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/users/:id', async (req, res) => {
    try {
        const user = await db.get(
            'SELECT id, name, email, phone, wallet_balance, role, status, created_at FROM users WHERE id = $1',
            [req.params.id]
        );
        if (!user) return res.status(404).json({ error: 'User not found' });

        const txnCount = await db.get('SELECT COUNT(*) as count FROM transactions WHERE user_id = $1', [user.id]);
        const numCount = await db.get('SELECT COUNT(*) as count FROM virtual_numbers WHERE user_id = $1', [user.id]);
        const totalSpent = await db.get("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = $1 AND type = 'debit'", [user.id]);
        const recentTxns = await db.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [user.id]);
        const numbers = await db.query('SELECT * FROM virtual_numbers WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [user.id]);

        res.json({
            user,
            stats: { transactions: parseInt(txnCount.count), numbers: parseInt(numCount.count), total_spent: parseFloat(totalSpent.total) },
            recent_transactions: recentTxns,
            virtual_numbers: numbers
        });
    } catch (err) {
        console.error('User detail error:', err.message);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

router.put('/users/:id', async (req, res) => {
    const { name, email, phone, status, role, wallet_balance } = req.body;

    try {
        const targetUser = await db.get('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        if (parseInt(req.params.id) === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot remove your own admin role' });
        }

        const updates = [];
        const params = [];
        let paramIdx = 1;

        if (name) { updates.push(`name = $${paramIdx++}`); params.push(name); }
        if (email) { updates.push(`email = $${paramIdx++}`); params.push(email); }
        if (phone !== undefined) { updates.push(`phone = $${paramIdx++}`); params.push(phone); }
        if (status) { updates.push(`status = $${paramIdx++}`); params.push(status); }
        if (role) { updates.push(`role = $${paramIdx++}`); params.push(role); }
        if (wallet_balance !== undefined && !isNaN(wallet_balance)) {
            updates.push(`wallet_balance = $${paramIdx++}`);
            params.push(parseFloat(wallet_balance));
        }

        if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

        params.push(req.params.id);
        await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);

        await db.run(
            'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [req.user.id, 'update_user', 'user', req.params.id, JSON.stringify(req.body)]
        );

        const updated = await db.get('SELECT id, name, email, phone, wallet_balance, role, status, created_at FROM users WHERE id = $1', [req.params.id]);
        res.json({ message: 'User updated', user: updated });
    } catch (err) {
        console.error('Update user error:', err.message);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

router.post('/users/:id/reset-password', async (req, res) => {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
        const user = await db.get('SELECT id FROM users WHERE id = $1', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const hash = bcrypt.hashSync(new_password, 12);
        await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);

        await db.run(
            'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [req.user.id, 'reset_password', 'user', req.params.id, 'Password reset by admin']
        );

        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        console.error('Reset password error:', err.message);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

router.post('/users/:id/adjust-wallet', async (req, res) => {
    const { amount, reason } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Valid amount required' });

    try {
        const user = await db.get('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const adjustAmount = parseFloat(amount);
        const newBalance = parseFloat(user.wallet_balance) + adjustAmount;
        if (newBalance < 0) return res.status(400).json({ error: 'Resulting balance cannot be negative' });

        const ref = 'ADM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
        const txnType = adjustAmount >= 0 ? 'credit' : 'debit';

        await db.run('UPDATE users SET wallet_balance = $1 WHERE id = $2', [newBalance, req.params.id]);
        await db.run(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference, meta) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [req.params.id, txnType, 'admin', `Admin wallet adjustment: ${reason || 'No reason provided'}`, Math.abs(adjustAmount), ref, JSON.stringify({ admin_id: req.user.id, reason })]
        );
        await db.run(
            'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
            [req.params.id, adjustAmount >= 0 ? 'success' : 'warning', adjustAmount >= 0 ? 'Wallet Credited' : 'Wallet Debited',
                `₦${Math.abs(adjustAmount).toLocaleString()} was ${adjustAmount >= 0 ? 'added to' : 'deducted from'} your wallet. Reason: ${reason || 'Admin adjustment'}`]
        );

        await db.run(
            'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [req.user.id, 'adjust_wallet', 'user', req.params.id, JSON.stringify({ amount: adjustAmount, reason, new_balance: newBalance })]
        );

        res.json({ message: 'Wallet adjusted', new_balance: newBalance, reference: ref });
    } catch (err) {
        console.error('Adjust wallet error:', err.message);
        res.status(500).json({ error: 'Failed to adjust wallet' });
    }
});

router.delete('/users/:id', async (req, res) => {
    if (parseInt(req.params.id) === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    try {
        const user = await db.get('SELECT id, role FROM users WHERE id = $1', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await db.run('DELETE FROM notifications WHERE user_id = $1', [req.params.id]);
        await db.run('DELETE FROM sms_messages WHERE number_id IN (SELECT id FROM virtual_numbers WHERE user_id = $1)', [req.params.id]);
        await db.run('DELETE FROM virtual_numbers WHERE user_id = $1', [req.params.id]);
        await db.run('DELETE FROM transactions WHERE user_id = $1', [req.params.id]);
        await db.run('DELETE FROM users WHERE id = $1', [req.params.id]);

        await db.run(
            'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [req.user.id, 'delete_user', 'user', req.params.id, JSON.stringify({ email: user.email })]
        );

        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error('Delete user error:', err.message);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ===== TRANSACTION MANAGEMENT =====
router.get('/transactions', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const type = req.query.type || '';
    const status = req.query.status || '';

    let where = '1=1';
    const params = [];
    let paramIdx = 1;

    if (search) {
        where += ` AND (t.reference LIKE $${paramIdx} OR t.description LIKE $${paramIdx + 1} OR t.provider LIKE $${paramIdx + 2} OR u.name LIKE $${paramIdx + 3} OR u.email LIKE $${paramIdx + 4})`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        paramIdx += 5;
    }
    if (category) { where += ` AND t.category = $${paramIdx++}`; params.push(category); }
    if (type) { where += ` AND t.type = $${paramIdx++}`; params.push(type); }
    if (status) { where += ` AND t.status = $${paramIdx++}`; params.push(status); }

    try {
        const total = await db.get(`SELECT COUNT(*) as count FROM transactions t JOIN users u ON u.id = t.user_id WHERE ${where}`, params);
        const txnParams = [...params, limit, offset];
        const transactions = await db.query(`
            SELECT t.*, u.name as user_name, u.email as user_email
            FROM transactions t
            JOIN users u ON u.id = t.user_id
            WHERE ${where}
            ORDER BY t.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `, txnParams);

        res.json({ transactions, total: parseInt(total.count), limit, offset });
    } catch (err) {
        console.error('Transactions list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

router.put('/transactions/:id', async (req, res) => {
    const { status } = req.body;
    if (!['pending', 'completed', 'failed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const txn = await db.get('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
        if (!txn) return res.status(404).json({ error: 'Transaction not found' });

        await db.run('UPDATE transactions SET status = $1 WHERE id = $2', [status, req.params.id]);

        await db.run(
            'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [req.user.id, 'update_transaction', 'transaction', req.params.id, JSON.stringify({ old_status: txn.status, new_status: status })]
        );

        res.json({ message: 'Transaction updated' });
    } catch (err) {
        console.error('Update transaction error:', err.message);
        res.status(500).json({ error: 'Failed to update transaction' });
    }
});

// ===== VIRTUAL NUMBERS MANAGEMENT =====
router.get('/numbers', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const status = req.query.status || '';

    let where = '1=1';
    const params = [];
    let paramIdx = 1;

    if (search) {
        where += ` AND (vn.number LIKE $${paramIdx} OR vn.country LIKE $${paramIdx + 1} OR u.name LIKE $${paramIdx + 2} OR u.email LIKE $${paramIdx + 3})`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        paramIdx += 4;
    }
    if (status) { where += ` AND vn.status = $${paramIdx++}`; params.push(status); }

    try {
        const total = await db.get(`SELECT COUNT(*) as count FROM virtual_numbers vn JOIN users u ON u.id = vn.user_id WHERE ${where}`, params);
        const numParams = [...params, limit, offset];
        const numbers = await db.query(`
            SELECT vn.*, u.name as user_name, u.email as user_email,
            (SELECT COUNT(*) FROM sms_messages WHERE number_id = vn.id) as sms_count
            FROM virtual_numbers vn
            JOIN users u ON u.id = vn.user_id
            WHERE ${where}
            ORDER BY vn.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `, numParams);

        res.json({ numbers, total: parseInt(total.count), limit, offset });
    } catch (err) {
        console.error('Numbers list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch numbers' });
    }
});

router.get('/numbers/:id/sms', async (req, res) => {
    try {
        const num = await db.get('SELECT * FROM virtual_numbers WHERE id = $1', [req.params.id]);
        if (!num) return res.status(404).json({ error: 'Number not found' });

        const messages = await db.query('SELECT * FROM sms_messages WHERE number_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json({ number: num, messages });
    } catch (err) {
        console.error('Number SMS error:', err.message);
        res.status(500).json({ error: 'Failed to fetch SMS' });
    }
});

router.put('/numbers/:id', async (req, res) => {
    const { status } = req.body;
    if (!['active', 'expired', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        await db.run('UPDATE virtual_numbers SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ message: 'Number updated' });
    } catch (err) {
        console.error('Update number error:', err.message);
        res.status(500).json({ error: 'Failed to update number' });
    }
});

// ===== NOTIFICATIONS (BROADCAST) =====
router.post('/notifications/broadcast', async (req, res) => {
    const { title, message, type, user_ids } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message required' });

    const notifType = ['info', 'success', 'warning', 'error'].includes(type) ? type : 'info';

    try {
        let targets;
        if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
            targets = user_ids;
        } else {
            const activeUsers = await db.query("SELECT id FROM users WHERE role = 'user' AND status = 'active'");
            targets = activeUsers.map(u => u.id);
        }

        for (const uid of targets) {
            await db.run(
                'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
                [uid, notifType, title, message]
            );
        }

        await db.run(
            'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [req.user.id, 'broadcast_notification', 'notification', null, JSON.stringify({ title, recipients: targets.length })]
        );

        res.json({ message: `Notification sent to ${targets.length} users` });
    } catch (err) {
        console.error('Broadcast error:', err.message);
        res.status(500).json({ error: 'Failed to broadcast notification' });
    }
});

// ===== SETTINGS =====
router.get('/settings', async (req, res) => {
    try {
        const rows = await db.query('SELECT * FROM settings');
        const settings = {};
        rows.forEach(row => { settings[row.key] = row.value; });
        res.json({ settings });
    } catch (err) {
        console.error('Settings error:', err.message);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

router.put('/settings', async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object required' });
    }

    try {
        for (const [key, value] of Object.entries(settings)) {
            await db.run(
                'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
                [key, String(value)]
            );
        }

        await db.run(
            'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
            [req.user.id, 'update_settings', 'settings', null, JSON.stringify(settings)]
        );

        res.json({ message: 'Settings updated' });
    } catch (err) {
        console.error('Update settings error:', err.message);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ===== AUDIT LOG =====
router.get('/audit-log', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    try {
        const total = await db.get('SELECT COUNT(*) as count FROM audit_log');
        const logs = await db.query(`
            SELECT a.*, u.name as admin_name, u.email as admin_email
            FROM audit_log a
            JOIN users u ON u.id = a.admin_id
            ORDER BY a.created_at DESC LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json({ logs, total: parseInt(total.count), limit, offset });
    } catch (err) {
        console.error('Audit log error:', err.message);
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});

// ===== CONTACT MESSAGES =====
router.get('/contact-messages', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        const total = await db.get('SELECT COUNT(*) as count FROM contact_messages');
        const messages = await db.query(
            'SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        res.json({ messages, total: parseInt(total.count), limit, offset });
    } catch (e) {
        res.json({ messages: [], total: 0, limit: 50, offset: 0 });
    }
});

module.exports = router;
