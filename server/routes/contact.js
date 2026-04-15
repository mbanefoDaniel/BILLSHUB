const express = require('express');
const db = require('../db/database');

const router = express.Router();

// POST /api/contact - Handle contact form submissions
router.post('/', (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required' });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    if (message.length > 5000) {
        return res.status(400).json({ error: 'Message is too long (max 5000 characters)' });
    }

    // Store in a contact_messages table
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS contact_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    } catch (e) { /* table may already exist */ }

    db.prepare(
        'INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)'
    ).run(name, email, subject || '', message);

    console.log(`Contact form: ${name} <${email}> - ${subject || 'No subject'}`);

    res.json({ message: 'Thank you! Your message has been received. We\'ll get back to you soon.' });
});

module.exports = router;
