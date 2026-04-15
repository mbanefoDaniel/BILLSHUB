const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const fivesim = require('../services/fivesim');

const router = express.Router();

const COUNTRIES = {
    us: { name: 'United States', code: '+1', flag: '🇺🇸', price: 4500 },
    uk: { name: 'United Kingdom', code: '+44', flag: '🇬🇧', price: 5200 },
    ca: { name: 'Canada', code: '+1', flag: '🇨🇦', price: 4500 },
    de: { name: 'Germany', code: '+49', flag: '🇩🇪', price: 5800 },
    fr: { name: 'France', code: '+33', flag: '🇫🇷', price: 5500 },
    nl: { name: 'Netherlands', code: '+31', flag: '🇳🇱', price: 5000 },
    es: { name: 'Spain', code: '+34', flag: '🇪🇸', price: 4800 },
    it: { name: 'Italy', code: '+39', flag: '🇮🇹', price: 4800 },
    pt: { name: 'Portugal', code: '+351', flag: '🇵🇹', price: 4500 },
    se: { name: 'Sweden', code: '+46', flag: '🇸🇪', price: 5500 },
    pl: { name: 'Poland', code: '+48', flag: '🇵🇱', price: 3500 },
    cz: { name: 'Czech Republic', code: '+420', flag: '🇨🇿', price: 4000 },
    at: { name: 'Austria', code: '+43', flag: '🇦🇹', price: 5000 },
    ro: { name: 'Romania', code: '+40', flag: '🇷🇴', price: 3000 },
    ua: { name: 'Ukraine', code: '+380', flag: '🇺🇦', price: 2500 },
    ru: { name: 'Russia', code: '+7', flag: '🇷🇺', price: 3000 },
    in: { name: 'India', code: '+91', flag: '🇮🇳', price: 2200 },
    id: { name: 'Indonesia', code: '+62', flag: '🇮🇩', price: 2000 },
    ph: { name: 'Philippines', code: '+63', flag: '🇵🇭', price: 2200 },
    th: { name: 'Thailand', code: '+66', flag: '🇹🇭', price: 2500 },
    my: { name: 'Malaysia', code: '+60', flag: '🇲🇾', price: 2800 },
    vn: { name: 'Vietnam', code: '+84', flag: '🇻🇳', price: 2000 },
    cn: { name: 'China', code: '+86', flag: '🇨🇳', price: 6000 },
    hk: { name: 'Hong Kong', code: '+852', flag: '🇭🇰', price: 5000 },
    kr: { name: 'South Korea', code: '+82', flag: '🇰🇷', price: 5500 },
    jp: { name: 'Japan', code: '+81', flag: '🇯🇵', price: 6000 },
    au: { name: 'Australia', code: '+61', flag: '🇦🇺', price: 5000 },
    nz: { name: 'New Zealand', code: '+64', flag: '🇳🇿', price: 4500 },
    br: { name: 'Brazil', code: '+55', flag: '🇧🇷', price: 3000 },
    mx: { name: 'Mexico', code: '+52', flag: '🇲🇽', price: 3500 },
    ar: { name: 'Argentina', code: '+54', flag: '🇦🇷', price: 3000 },
    co: { name: 'Colombia', code: '+57', flag: '🇨🇴', price: 2800 },
    cl: { name: 'Chile', code: '+56', flag: '🇨🇱', price: 3000 },
    ng: { name: 'Nigeria', code: '+234', flag: '🇳🇬', price: 1500 },
    za: { name: 'South Africa', code: '+27', flag: '🇿🇦', price: 2800 },
    gh: { name: 'Ghana', code: '+233', flag: '🇬🇭', price: 2000 },
    ke: { name: 'Kenya', code: '+254', flag: '🇰🇪', price: 2000 },
    eg: { name: 'Egypt', code: '+20', flag: '🇪🇬', price: 2500 },
    tz: { name: 'Tanzania', code: '+255', flag: '🇹🇿', price: 2000 },
    tr: { name: 'Turkey', code: '+90', flag: '🇹🇷', price: 3000 },
    ae: { name: 'UAE', code: '+971', flag: '🇦🇪', price: 5500 },
    sa: { name: 'Saudi Arabia', code: '+966', flag: '🇸🇦', price: 5000 },
    il: { name: 'Israel', code: '+972', flag: '🇮🇱', price: 5000 },
    pk: { name: 'Pakistan', code: '+92', flag: '🇵🇰', price: 2000 },
    bd: { name: 'Bangladesh', code: '+880', flag: '🇧🇩', price: 1800 },
};

// Sandbox SMS templates for when 5sim is not configured
const SMS_TEMPLATES = [
    { sender: 'WhatsApp', message: 'Your WhatsApp code is {code}. Do not share this code.' },
    { sender: 'Google', message: 'G-{code} is your Google verification code.' },
    { sender: 'Telegram', message: 'Telegram code: {code}. Do not give this code to anyone.' },
    { sender: 'Facebook', message: 'Your Facebook code is: {code}' },
    { sender: 'Twitter', message: 'Your Twitter confirmation code is {code}.' },
    { sender: 'Instagram', message: '{code} is your Instagram code.' }
];

function generatePhoneNumber(countryCode) {
    let number = countryCode;
    for (let i = 0; i < 10; i++) {
        number += Math.floor(Math.random() * 10);
    }
    return number;
}

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function is5simEnabled() {
    return !!process.env.FIVESIM_API_KEY;
}

// GET /api/numbers/countries
router.get('/countries', (req, res) => {
    res.json({ countries: COUNTRIES });
});

// GET /api/numbers/products/:country - Get available services & real prices for a country
router.get('/products/:country', async (req, res) => {
    const countryId = req.params.country;

    if (!is5simEnabled()) {
        // Sandbox: return static services
        return res.json({
            products: {
                whatsapp: { price: COUNTRIES[countryId]?.price || 2000 },
                google: { price: COUNTRIES[countryId]?.price || 2000 },
                telegram: { price: COUNTRIES[countryId]?.price || 2000 },
                facebook: { price: COUNTRIES[countryId]?.price || 2000 },
                twitter: { price: COUNTRIES[countryId]?.price || 2000 },
                instagram: { price: COUNTRIES[countryId]?.price || 2000 }
            }
        });
    }

    try {
        const products = await fivesim.getProducts(countryId);
        // Convert 5sim prices (in RUB) to NGN with markup
        const rubToNgn = parseFloat(process.env.RUB_TO_NGN_RATE || '18'); // ~18 NGN per RUB
        const markup = parseFloat(process.env.NUMBER_MARKUP_PERCENT || '30'); // 30% profit margin

        const formatted = {};
        for (const [key, value] of Object.entries(products)) {
            if (value && value.Price !== undefined) {
                const basePrice = value.Price * rubToNgn;
                const finalPrice = Math.ceil(basePrice * (1 + markup / 100) / 50) * 50; // Round to nearest 50
                formatted[key] = {
                    price: Math.max(finalPrice, 500), // Minimum ₦500
                    count: value.Qty || 0
                };
            }
        }
        res.json({ products: formatted });
    } catch (err) {
        console.error('Products error:', err.message);
        res.status(500).json({ error: 'Failed to fetch available services' });
    }
});

// POST /api/numbers/purchase
router.post('/purchase', authenticate, async (req, res) => {
    const { country_id, service, type } = req.body;

    if (!country_id) {
        return res.status(400).json({ error: 'Country is required' });
    }

    const country = COUNTRIES[country_id];
    if (!country) {
        return res.status(400).json({ error: 'Invalid country' });
    }

    const price = country.price;
    const serviceName = service || 'any';

    // In live mode, calculate dynamic price from 5sim rates with markup
    let chargePrice = price; // Default to hardcoded price (used in sandbox)
    if (is5simEnabled()) {
        try {
            const products = await fivesim.getProducts(country_id);
            const productData = products[serviceName] || products['any'];
            if (productData && productData.Price !== undefined) {
                const rubToNgn = parseFloat(process.env.RUB_TO_NGN_RATE || '18');
                const markup = parseFloat(process.env.NUMBER_MARKUP_PERCENT || '30');
                const basePrice = productData.Price * rubToNgn;
                chargePrice = Math.max(Math.ceil(basePrice * (1 + markup / 100) / 50) * 50, 500);
            }
        } catch (err) {
            console.error('Price lookup failed, using fallback:', err.message);
            // Fall back to hardcoded country price
        }
    }

    // Check balance
    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
    if (user.wallet_balance < chargePrice) {
        return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    const ref = 'NUM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    let phoneNumber, expiresAt, fivesimOrderId = null;

    if (is5simEnabled()) {
        // Real 5sim purchase
        try {
            const order = await fivesim.buyNumber(country_id, serviceName);

            phoneNumber = order.phone;
            // If phone doesn't start with +, add the country code
            if (!phoneNumber.startsWith('+')) {
                phoneNumber = '+' + phoneNumber;
            }
            fivesimOrderId = order.id;
            expiresAt = order.expires || new Date(Date.now() + 20 * 60 * 1000).toISOString();

        } catch (err) {
            console.error('5sim purchase error:', err.message);
            return res.status(400).json({ error: err.message });
        }
    } else {
        // Sandbox mode
        phoneNumber = generatePhoneNumber(country.code);
        expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    }

    const purchase = db.transaction(() => {
        db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(chargePrice, req.user.id);

        const result = db.prepare(
            'INSERT INTO virtual_numbers (user_id, number, country, country_code, service, type, price, expires_at, status, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            req.user.id, phoneNumber, country.name, country_id,
            serviceName, type || 'temporary', chargePrice, expiresAt, 'active',
            JSON.stringify({ fivesim_order_id: fivesimOrderId })
        );

        db.prepare(
            'INSERT INTO transactions (user_id, type, category, description, amount, reference, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
            req.user.id, 'debit', 'number',
            `Virtual number purchase - ${country.name} (${serviceName})`,
            chargePrice, ref,
            JSON.stringify({ country_id, number: phoneNumber, service: serviceName, fivesim_order_id: fivesimOrderId })
        );

        db.prepare(
            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
        ).run(req.user.id, 'success', 'Number Purchased', `Your ${country.name} number ${phoneNumber} is ready!`);

        return result.lastInsertRowid;
    });

    const numberId = purchase();

    // Sandbox: simulate SMS after delay
    if (!is5simEnabled()) {
        const randomDelay = 3000 + Math.floor(Math.random() * 5000);
        setTimeout(() => {
            try {
                const template = SMS_TEMPLATES[Math.floor(Math.random() * SMS_TEMPLATES.length)];
                const code = generateOtp();
                const message = template.message.replace('{code}', code);

                db.prepare(
                    'INSERT INTO sms_messages (number_id, sender, message, code) VALUES (?, ?, ?, ?)'
                ).run(numberId, template.sender, message, code);

                db.prepare(
                    'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
                ).run(req.user.id, 'info', 'New SMS Received', `New message from ${template.sender} on ${phoneNumber}`);
            } catch (e) {
                // Number may have expired
            }
        }, randomDelay);
    }

    const updatedUser = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);

    res.json({
        message: 'Number purchased successfully',
        number: {
            id: numberId,
            number: phoneNumber,
            country: country.name,
            country_code: country_id,
            service: serviceName,
            type: type || 'temporary',
            price,
            expires_at: expiresAt,
            fivesim_order_id: fivesimOrderId
        },
        balance: updatedUser.wallet_balance
    });
});

// GET /api/numbers/:id/sms - Check for SMS (polls 5sim if configured)
router.get('/:id/sms', authenticate, async (req, res) => {
    const numberId = parseInt(req.params.id);

    // Verify ownership
    const num = db.prepare('SELECT * FROM virtual_numbers WHERE id = ? AND user_id = ?').get(numberId, req.user.id);
    if (!num) {
        return res.status(404).json({ error: 'Number not found' });
    }

    const meta = num.meta ? JSON.parse(num.meta) : {};
    const fivesimOrderId = meta.fivesim_order_id;

    // If 5sim is active and we have an order ID, poll for new SMS
    if (is5simEnabled() && fivesimOrderId) {
        try {
            const order = await fivesim.checkOrder(fivesimOrderId);

            // Update status in our DB
            let localStatus = num.status;
            if (order.status === 'RECEIVED' || order.status === 'FINISHED') {
                localStatus = 'active';
            } else if (order.status === 'CANCELED' || order.status === 'BANNED' || order.status === 'TIMEOUT') {
                localStatus = 'expired';
            }
            if (localStatus !== num.status) {
                db.prepare('UPDATE virtual_numbers SET status = ? WHERE id = ?').run(localStatus, numberId);
            }

            // Store any new SMS from 5sim
            if (order.sms && order.sms.length > 0) {
                for (const sms of order.sms) {
                    // Check if we already stored this SMS (by message text + created_at)
                    const existing = db.prepare(
                        'SELECT id FROM sms_messages WHERE number_id = ? AND message = ?'
                    ).get(numberId, sms.text);

                    if (!existing) {
                        db.prepare(
                            'INSERT INTO sms_messages (number_id, sender, message, code) VALUES (?, ?, ?, ?)'
                        ).run(numberId, sms.sender || 'Unknown', sms.text, sms.code || null);

                        // Notify user
                        db.prepare(
                            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
                        ).run(
                            req.user.id, 'info', 'SMS Received',
                            `New message on ${num.number}: ${sms.text.substring(0, 50)}${sms.text.length > 50 ? '...' : ''}`
                        );
                    }
                }
            }
        } catch (err) {
            console.error('5sim check error:', err.message);
            // Continue - still return local messages
        }
    }

    // Return messages from our DB
    const messages = db.prepare(
        'SELECT * FROM sms_messages WHERE number_id = ? ORDER BY created_at DESC'
    ).all(numberId);

    res.json({ number: num, messages });
});

// POST /api/numbers/:id/finish - Mark number as done (finish 5sim order)
router.post('/:id/finish', authenticate, async (req, res) => {
    const numberId = parseInt(req.params.id);

    const num = db.prepare('SELECT * FROM virtual_numbers WHERE id = ? AND user_id = ?').get(numberId, req.user.id);
    if (!num) {
        return res.status(404).json({ error: 'Number not found' });
    }

    const meta = num.meta ? JSON.parse(num.meta) : {};

    if (is5simEnabled() && meta.fivesim_order_id) {
        try {
            await fivesim.finishOrder(meta.fivesim_order_id);
        } catch (err) {
            console.error('5sim finish error:', err.message);
        }
    }

    db.prepare('UPDATE virtual_numbers SET status = ? WHERE id = ?').run('completed', numberId);

    res.json({ message: 'Number marked as completed' });
});

// POST /api/numbers/:id/cancel - Cancel number (refund if no SMS)
router.post('/:id/cancel', authenticate, async (req, res) => {
    const numberId = parseInt(req.params.id);

    const num = db.prepare('SELECT * FROM virtual_numbers WHERE id = ? AND user_id = ?').get(numberId, req.user.id);
    if (!num) {
        return res.status(404).json({ error: 'Number not found' });
    }

    if (num.status !== 'active') {
        return res.status(400).json({ error: 'Can only cancel active numbers' });
    }

    const meta = num.meta ? JSON.parse(num.meta) : {};
    let refunded = false;

    if (is5simEnabled() && meta.fivesim_order_id) {
        try {
            await fivesim.cancelOrder(meta.fivesim_order_id);
            refunded = true;
        } catch (err) {
            console.error('5sim cancel error:', err.message);
            // If cancel fails (e.g. SMS already received), don't refund
            return res.status(400).json({ error: 'Cannot cancel - SMS may already be received. Try finishing instead.' });
        }
    } else {
        // Sandbox mode - check if no SMS received
        const smsCount = db.prepare('SELECT COUNT(*) as count FROM sms_messages WHERE number_id = ?').get(numberId);
        if (smsCount.count === 0) {
            refunded = true;
        }
    }

    const cancelTxn = db.transaction(() => {
        db.prepare('UPDATE virtual_numbers SET status = ? WHERE id = ?').run('cancelled', numberId);

        if (refunded) {
            db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(num.price, req.user.id);

            db.prepare(
                'INSERT INTO transactions (user_id, type, category, description, amount, reference, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(
                req.user.id, 'credit', 'refund',
                `Refund - cancelled ${num.country} number`,
                num.price, 'REF-' + Date.now(),
                JSON.stringify({ original_number: num.number })
            );

            db.prepare(
                'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
            ).run(req.user.id, 'info', 'Number Cancelled', `₦${num.price.toLocaleString()} refunded for cancelled ${num.country} number.`);
        }
    });

    cancelTxn();

    const updatedUser = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);

    res.json({
        message: refunded ? 'Number cancelled and refunded' : 'Number cancelled',
        refunded,
        balance: updatedUser.wallet_balance
    });
});

// GET /api/numbers/my
router.get('/my', authenticate, (req, res) => {
    const numbers = db.prepare(
        'SELECT * FROM virtual_numbers WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id);

    res.json({ numbers });
});

module.exports = router;
