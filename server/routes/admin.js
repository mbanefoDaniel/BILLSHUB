const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// ===== DASHBOARD STATS =====
router.get('/stats', (req, res) => {
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user'").get().count;
    const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user' AND status = 'active'").get().count;
    const suspendedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'suspended'").get().count;
    const bannedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'banned'").get().count;

    const totalTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'debit'").get().total;
    const totalDeposits = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'credit' AND category = 'deposit'").get().total;
    const totalBills = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE category = 'bill'").get().count;

    const totalNumbers = db.prepare('SELECT COUNT(*) as count FROM virtual_numbers').get().count;
    const activeNumbers = db.prepare("SELECT COUNT(*) as count FROM virtual_numbers WHERE status = 'active'").get().count;
    const totalSms = db.prepare('SELECT COUNT(*) as count FROM sms_messages').get().count;

    const totalWalletBalance = db.prepare("SELECT COALESCE(SUM(wallet_balance), 0) as total FROM users WHERE role = 'user'").get().total;

    // Recent signups (last 7 days)
    const recentSignups = db.prepare(
        "SELECT COUNT(*) as count FROM users WHERE role = 'user' AND created_at >= datetime('now', '-7 days')"
    ).get().count;

    // Revenue last 7 days
    const recentRevenue = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'debit' AND created_at >= datetime('now', '-7 days')"
    ).get().total;

    // Transactions per day (last 14 days)
    const dailyTxns = db.prepare(`
        SELECT date(created_at) as day, COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
        FROM transactions
        WHERE created_at >= datetime('now', '-14 days')
        GROUP BY date(created_at)
        ORDER BY day ASC
    `).all();

    // Signups per day (last 14 days)
    const dailySignups = db.prepare(`
        SELECT date(created_at) as day, COUNT(*) as count
        FROM users
        WHERE role = 'user' AND created_at >= datetime('now', '-14 days')
        GROUP BY date(created_at)
        ORDER BY day ASC
    `).all();

    // Top spenders
    const topSpenders = db.prepare(`
        SELECT u.id, u.name, u.email, COALESCE(SUM(t.amount), 0) as total_spent
        FROM users u
        LEFT JOIN transactions t ON t.user_id = u.id AND t.type = 'debit'
        WHERE u.role = 'user'
        GROUP BY u.id
        ORDER BY total_spent DESC
        LIMIT 5
    `).all();

    res.json({
        users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, banned: bannedUsers, recent_signups: recentSignups },
        transactions: { total: totalTransactions, revenue: totalRevenue, deposits: totalDeposits, bills: totalBills, recent_revenue: recentRevenue },
        numbers: { total: totalNumbers, active: activeNumbers, total_sms: totalSms },
        wallet: { total_balance: totalWalletBalance },
        charts: { daily_txns: dailyTxns, daily_signups: dailySignups },
        top_spenders: topSpenders
    });
});

// ===== USER MANAGEMENT =====
router.get('/users', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const role = req.query.role || '';
    const sortBy = ['name', 'email', 'wallet_balance', 'created_at'].includes(req.query.sort) ? req.query.sort : 'created_at';
    const sortDir = req.query.dir === 'asc' ? 'ASC' : 'DESC';

    let where = '1=1';
    const params = [];

    if (search) {
        where += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
        where += ' AND status = ?';
        params.push(status);
    }
    if (role) {
        where += ' AND role = ?';
        params.push(role);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM users WHERE ${where}`).get(...params).count;
    params.push(limit, offset);
    const users = db.prepare(
        `SELECT id, name, email, phone, wallet_balance, role, status, created_at FROM users WHERE ${where} ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`
    ).all(...params);

    res.json({ users, total, limit, offset });
});

router.get('/users/:id', (req, res) => {
    const user = db.prepare(
        'SELECT id, name, email, phone, wallet_balance, role, status, created_at FROM users WHERE id = ?'
    ).get(req.params.id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const txnCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(user.id).count;
    const numCount = db.prepare('SELECT COUNT(*) as count FROM virtual_numbers WHERE user_id = ?').get(user.id).count;
    const totalSpent = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'debit'").get(user.id).total;
    const recentTxns = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(user.id);
    const numbers = db.prepare('SELECT * FROM virtual_numbers WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(user.id);

    res.json({
        user,
        stats: { transactions: txnCount, numbers: numCount, total_spent: totalSpent },
        recent_transactions: recentTxns,
        virtual_numbers: numbers
    });
});

router.put('/users/:id', (req, res) => {
    const { name, email, phone, status, role, wallet_balance } = req.body;
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Prevent self-demotion
    if (parseInt(req.params.id) === req.user.id && role && role !== 'admin') {
        return res.status(400).json({ error: 'Cannot remove your own admin role' });
    }

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (email) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (status) { updates.push('status = ?'); params.push(status); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (wallet_balance !== undefined && !isNaN(wallet_balance)) {
        updates.push('wallet_balance = ?');
        params.push(parseFloat(wallet_balance));
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Audit log
    db.prepare(
        'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'update_user', 'user', req.params.id, JSON.stringify(req.body));

    const updated = db.prepare('SELECT id, name, email, phone, wallet_balance, role, status, created_at FROM users WHERE id = ?').get(req.params.id);
    res.json({ message: 'User updated', user: updated });
});

router.post('/users/:id/reset-password', (req, res) => {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hash = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);

    db.prepare(
        'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'reset_password', 'user', req.params.id, 'Password reset by admin');

    res.json({ message: 'Password reset successfully' });
});

router.post('/users/:id/adjust-wallet', (req, res) => {
    const { amount, reason } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Valid amount required' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const adjustAmount = parseFloat(amount);
    const newBalance = user.wallet_balance + adjustAmount;
    if (newBalance < 0) return res.status(400).json({ error: 'Resulting balance cannot be negative' });

    const ref = 'ADM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const txnType = adjustAmount >= 0 ? 'credit' : 'debit';

    const adjust = db.transaction(() => {
        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, req.params.id);
        db.prepare(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
            req.params.id, txnType, 'admin',
            `Admin wallet adjustment: ${reason || 'No reason provided'}`,
            Math.abs(adjustAmount), ref,
            JSON.stringify({ admin_id: req.user.id, reason })
        );
        db.prepare(
            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
        ).run(
            req.params.id,
            adjustAmount >= 0 ? 'success' : 'warning',
            adjustAmount >= 0 ? 'Wallet Credited' : 'Wallet Debited',
            `₦${Math.abs(adjustAmount).toLocaleString()} was ${adjustAmount >= 0 ? 'added to' : 'deducted from'} your wallet. Reason: ${reason || 'Admin adjustment'}`
        );
    });

    adjust();

    db.prepare(
        'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'adjust_wallet', 'user', req.params.id, JSON.stringify({ amount: adjustAmount, reason, new_balance: newBalance }));

    res.json({ message: 'Wallet adjusted', new_balance: newBalance, reference: ref });
});

router.delete('/users/:id', (req, res) => {
    if (parseInt(req.params.id) === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const del = db.transaction(() => {
        db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.params.id);
        db.prepare('DELETE FROM sms_messages WHERE number_id IN (SELECT id FROM virtual_numbers WHERE user_id = ?)').run(req.params.id);
        db.prepare('DELETE FROM virtual_numbers WHERE user_id = ?').run(req.params.id);
        db.prepare('DELETE FROM transactions WHERE user_id = ?').run(req.params.id);
        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    });
    del();

    db.prepare(
        'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'delete_user', 'user', req.params.id, JSON.stringify({ email: user.email }));

    res.json({ message: 'User deleted' });
});

// ===== TRANSACTION MANAGEMENT =====
router.get('/transactions', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const type = req.query.type || '';
    const status = req.query.status || '';

    let where = '1=1';
    const params = [];

    if (search) {
        where += ' AND (t.reference LIKE ? OR t.description LIKE ? OR t.provider LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) { where += ' AND t.category = ?'; params.push(category); }
    if (type) { where += ' AND t.type = ?'; params.push(type); }
    if (status) { where += ' AND t.status = ?'; params.push(status); }

    const total = db.prepare(`SELECT COUNT(*) as count FROM transactions t JOIN users u ON u.id = t.user_id WHERE ${where}`).get(...params).count;
    params.push(limit, offset);
    const transactions = db.prepare(`
        SELECT t.*, u.name as user_name, u.email as user_email
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        WHERE ${where}
        ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `).all(...params);

    res.json({ transactions, total, limit, offset });
});

router.put('/transactions/:id', (req, res) => {
    const { status } = req.body;
    if (!['pending', 'completed', 'failed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    db.prepare('UPDATE transactions SET status = ? WHERE id = ?').run(status, req.params.id);

    db.prepare(
        'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'update_transaction', 'transaction', req.params.id, JSON.stringify({ old_status: txn.status, new_status: status }));

    res.json({ message: 'Transaction updated' });
});

// ===== VIRTUAL NUMBERS MANAGEMENT =====
router.get('/numbers', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const status = req.query.status || '';

    let where = '1=1';
    const params = [];

    if (search) {
        where += ' AND (vn.number LIKE ? OR vn.country LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where += ' AND vn.status = ?'; params.push(status); }

    const total = db.prepare(`SELECT COUNT(*) as count FROM virtual_numbers vn JOIN users u ON u.id = vn.user_id WHERE ${where}`).get(...params).count;
    params.push(limit, offset);
    const numbers = db.prepare(`
        SELECT vn.*, u.name as user_name, u.email as user_email,
        (SELECT COUNT(*) FROM sms_messages WHERE number_id = vn.id) as sms_count
        FROM virtual_numbers vn
        JOIN users u ON u.id = vn.user_id
        WHERE ${where}
        ORDER BY vn.created_at DESC LIMIT ? OFFSET ?
    `).all(...params);

    res.json({ numbers, total, limit, offset });
});

router.get('/numbers/:id/sms', (req, res) => {
    const num = db.prepare('SELECT * FROM virtual_numbers WHERE id = ?').get(req.params.id);
    if (!num) return res.status(404).json({ error: 'Number not found' });

    const messages = db.prepare('SELECT * FROM sms_messages WHERE number_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ number: num, messages });
});

router.put('/numbers/:id', (req, res) => {
    const { status } = req.body;
    if (!['active', 'expired', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    db.prepare('UPDATE virtual_numbers SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: 'Number updated' });
});

// ===== NOTIFICATIONS (BROADCAST) =====
router.post('/notifications/broadcast', (req, res) => {
    const { title, message, type, user_ids } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message required' });

    const notifType = ['info', 'success', 'warning', 'error'].includes(type) ? type : 'info';

    let targets;
    if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
        targets = user_ids;
    } else {
        // Send to all active users
        targets = db.prepare("SELECT id FROM users WHERE role = 'user' AND status = 'active'").all().map(u => u.id);
    }

    const insert = db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)');
    const broadcast = db.transaction(() => {
        for (const uid of targets) {
            insert.run(uid, notifType, title, message);
        }
    });
    broadcast();

    db.prepare(
        'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'broadcast_notification', 'notification', null, JSON.stringify({ title, recipients: targets.length }));

    res.json({ message: `Notification sent to ${targets.length} users` });
});

// ===== SETTINGS =====
router.get('/settings', (req, res) => {
    const settings = {};
    db.prepare('SELECT * FROM settings').all().forEach(row => {
        settings[row.key] = row.value;
    });
    res.json({ settings });
});

router.put('/settings', (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object required' });
    }

    const upsert = db.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP'
    );

    const update = db.transaction(() => {
        for (const [key, value] of Object.entries(settings)) {
            upsert.run(key, String(value), String(value));
        }
    });
    update();

    db.prepare(
        'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, 'update_settings', 'settings', null, JSON.stringify(settings));

    res.json({ message: 'Settings updated' });
});

// ===== AUDIT LOG =====
router.get('/audit-log', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;
    const logs = db.prepare(`
        SELECT a.*, u.name as admin_name, u.email as admin_email
        FROM audit_log a
        JOIN users u ON u.id = a.admin_id
        ORDER BY a.created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({ logs, total, limit, offset });
});

// ===== CONTACT MESSAGES =====
router.get('/contact-messages', (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        const total = db.prepare('SELECT COUNT(*) as count FROM contact_messages').get().count;
        const messages = db.prepare(
            'SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).all(limit, offset);

        res.json({ messages, total, limit, offset });
    } catch (e) {
        res.json({ messages: [], total: 0, limit: 50, offset: 0 });
    }
});

module.exports = router;
