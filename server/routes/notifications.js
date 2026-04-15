const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications
router.get('/', authenticate, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const notifications = db.prepare(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(req.user.id, limit, offset);

    const unread = db.prepare(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
    ).get(req.user.id);

    res.json({ notifications, unread_count: unread.count });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, (req, res) => {
    const id = parseInt(req.params.id);
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Notification marked as read' });
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, (req, res) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ message: 'All notifications marked as read' });
});

module.exports = router;
