const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = bcrypt.hashSync(password, 12);
    const welcomeBonus = 5000.00;

    const result = db.prepare(
        'INSERT INTO users (name, email, phone, password_hash, wallet_balance) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, phone || null, passwordHash, welcomeBonus);

    const userId = result.lastInsertRowid;

    // Record welcome bonus transaction
    const ref = 'WB-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    db.prepare(
        'INSERT INTO transactions (user_id, type, category, description, amount, reference) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, 'credit', 'bonus', 'Welcome bonus', welcomeBonus, ref);

    // Welcome notification
    db.prepare(
        'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
    ).run(userId, 'success', 'Welcome to Nefotech!', 'Your account has been created. You received a ₦5,000 welcome bonus!');

    const token = jwt.sign({ id: userId, email, name }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
        message: 'Account created successfully',
        token,
        user: { id: userId, name, email, phone: phone || null, wallet_balance: welcomeBonus }
    });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({
        message: 'Login successful',
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            wallet_balance: user.wallet_balance,
            role: user.role,
            status: user.status
        }
    });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
    const user = db.prepare('SELECT id, name, email, phone, wallet_balance, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
});

// PUT /api/auth/profile
router.put('/profile', authenticate, (req, res) => {
    const { name, phone } = req.body;
    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare('SELECT id, name, email, phone, wallet_balance FROM users WHERE id = ?').get(req.user.id);
    res.json({ message: 'Profile updated', user });
});

// PUT /api/auth/password - Change password (authenticated)
router.put('/password', authenticate, (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const valid = bcrypt.compareSync(current_password, user.password_hash);
    if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    res.json({ message: 'Password changed successfully' });
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);

    // Always return success to prevent email enumeration
    if (!user) {
        return res.json({ message: 'If that email exists, a password reset link has been sent.' });
    }

    // Generate a reset token (valid for 1 hour)
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    // Store reset token in user record
    try {
        db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT");
        db.exec("ALTER TABLE users ADD COLUMN reset_token_expires DATETIME");
    } catch (e) { /* columns may already exist */ }

    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
        .run(resetToken, resetExpiry, user.id);

    // In production, send email here. For now, log to console.
    console.log(`Password reset requested for ${email}. Token: ${resetToken}`);
    console.log(`Reset URL: /reset-password.html?token=${resetToken}`);

    res.json({ message: 'If that email exists, a password reset link has been sent.' });
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', (req, res) => {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (new_password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = db.prepare('SELECT id, reset_token, reset_token_expires FROM users WHERE reset_token = ?').get(token);

    if (!user || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const newHash = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
        .run(newHash, user.id);

    res.json({ message: 'Password has been reset successfully. You can now sign in.' });
});

module.exports = router;
