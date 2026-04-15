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

async function requireAdmin(req, res, next) {
    try {
        const user = await db.get('SELECT role, status FROM users WHERE id = $1', [req.user.id]);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Account is suspended' });
        }
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Authorization check failed' });
    }
}

module.exports = { authenticate, requireAdmin };
