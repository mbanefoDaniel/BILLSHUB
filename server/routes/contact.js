const express = require('express');
const db = require('../db/database');

const router = express.Router();

// POST /api/contact
router.post('/', async (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    if (message.length > 5000) {
        return res.status(400).json({ error: 'Message is too long (max 5000 characters)' });
    }

    try {
        await db.run(
            'INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)',
            [name, email, subject || '', message]
        );

        console.log(`Contact form: ${name} <${email}> - ${subject || 'No subject'}`);
        res.json({ message: 'Thank you! Your message has been received. We\'ll get back to you soon.' });
    } catch (err) {
        console.error('Contact error:', err.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

module.exports = router;
