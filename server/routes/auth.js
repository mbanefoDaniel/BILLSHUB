const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
        const existing = await db.get('SELECT id FROM users WHERE email = $1', [email]);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const passwordHash = bcrypt.hashSync(password, 12);
        const welcomeBonus = 5000.00;

        const result = await db.query(
            'INSERT INTO users (name, email, phone, password_hash, wallet_balance) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, email, phone || null, passwordHash, welcomeBonus]
        );
        const userId = result[0].id;

        const ref = 'WB-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
        await db.run(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, 'credit', 'bonus', 'Welcome bonus', welcomeBonus, ref]
        );

        await db.run(
            'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
            [userId, 'success', 'Welcome to Nefotech!', 'Your account has been created. You received a ₦5,000 welcome bonus!']
        );

        const token = jwt.sign({ id: userId, email, name }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: { id: userId, name, email, phone: phone || null, wallet_balance: welcomeBonus }
        });
    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
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
                wallet_balance: parseFloat(user.wallet_balance),
                role: user.role,
                status: user.status
            }
        });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await db.get('SELECT id, name, email, phone, wallet_balance, created_at FROM users WHERE id = $1', [req.user.id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        user.wallet_balance = parseFloat(user.wallet_balance);
        res.json({ user });
    } catch (err) {
        console.error('Auth me error:', err.message);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res) => {
    const { name, phone } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); params.push(name); }
    if (phone) { updates.push(`phone = $${idx++}`); params.push(phone); }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    try {
        params.push(req.user.id);
        await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);

        const user = await db.get('SELECT id, name, email, phone, wallet_balance FROM users WHERE id = $1', [req.user.id]);
        user.wallet_balance = parseFloat(user.wallet_balance);
        res.json({ message: 'Profile updated', user });
    } catch (err) {
        console.error('Profile update error:', err.message);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// PUT /api/auth/password
router.put('/password', authenticate, async (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    try {
        const user = await db.get('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const valid = bcrypt.compareSync(current_password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newHash = bcrypt.hashSync(new_password, 12);
        await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error('Password change error:', err.message);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const user = await db.get('SELECT id, email, name FROM users WHERE email = $1', [email]);

        if (!user) {
            return res.json({ message: 'If that email exists, a password reset link has been sent.' });
        }

        const crypto = require('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = new Date(Date.now() + 3600000).toISOString();

        await db.run('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
            [resetToken, resetExpiry, user.id]);

        console.log(`Password reset requested for ${email}. Token: ${resetToken}`);
        console.log(`Reset URL: /reset-password.html?token=${resetToken}`);

        res.json({ message: 'If that email exists, a password reset link has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err.message);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (new_password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
        const user = await db.get('SELECT id, reset_token, reset_token_expires FROM users WHERE reset_token = $1', [token]);

        if (!user || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const newHash = bcrypt.hashSync(new_password, 12);
        await db.run('UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
            [newHash, user.id]);

        res.json({ message: 'Password has been reset successfully. You can now sign in.' });
    } catch (err) {
        console.error('Reset password error:', err.message);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;
