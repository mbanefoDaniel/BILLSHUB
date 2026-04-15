const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications
router.get('/', authenticate, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    try {
        const notifications = await db.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
            [req.user.id, limit, offset]
        );

        const unread = await db.get(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = 0',
            [req.user.id]
        );

        res.json({ notifications, unread_count: parseInt(unread.count) });
    } catch (err) {
        console.error('Notifications error:', err.message);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await db.run('UPDATE notifications SET read = 1 WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, async (req, res) => {
    try {
        await db.run('UPDATE notifications SET read = 1 WHERE user_id = $1', [req.user.id]);
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

module.exports = router;
