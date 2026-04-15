const jwt = require('jsonwebtoken');
const db = require('../db/database');

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireAdmin(req, res, next) {
    const user = db.prepare('SELECT role, status FROM users WHERE id = ?').get(req.user.id);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    if (user.status !== 'active') {
        return res.status(403).json({ error: 'Account is suspended' });
    }
    next();
}

module.exports = { authenticate, requireAdmin };
