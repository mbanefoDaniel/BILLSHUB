require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables on startup
const requiredEnv = ['JWT_SECRET'];
for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`FATAL: Missing required environment variable: ${key}`);
        process.exit(1);
    }
}
if (process.env.JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET is too short. Use at least 32 characters in production.');
}

// Security
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.paystack.co", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://i.pravatar.cc"],
            connectSrc: ["'self'", "https://api.paystack.co"],
            frameSrc: ["'self'", "https://checkout.paystack.com"]
        }
    }
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [`http://localhost:${PORT}`];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // In dev, allow all; tighten in production
        }
    },
    credentials: true
}));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many auth attempts, please try again later.' }
});

// Paystack webhook needs raw body for signature verification
app.post('/api/webhook/paystack', express.raw({ type: 'application/json' }), (req, res) => {
    const paystack = require('./services/paystack');
    const db = require('./db/database');

    const signature = req.headers['x-paystack-signature'];
    const body = JSON.parse(req.body.toString());

    if (!paystack.validateWebhook(body, signature)) {
        console.error('Invalid Paystack webhook signature');
        return res.sendStatus(400);
    }

    const event = body.event;
    const data = body.data;

    if (event === 'charge.success') {
        const reference = data.reference;
        const amountInNaira = data.amount / 100;
        const userId = data.metadata?.user_id;

        if (userId && reference) {
            const existingTxn = db.prepare('SELECT * FROM transactions WHERE reference = ?').get(reference);

            if (existingTxn && existingTxn.status === 'pending') {
                db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amountInNaira, userId);
                db.prepare('UPDATE transactions SET status = ? WHERE reference = ?').run('completed', reference);
                db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(
                    userId, 'success', 'Wallet Funded',
                    `₦${amountInNaira.toLocaleString()} has been added to your wallet.`
                );
                console.log(`Webhook: Funded ₦${amountInNaira} for user ${userId}, ref: ${reference}`);
            }
        }
    }

    res.sendStatus(200);
});

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, '..'), {
    index: 'index.html',
    extensions: ['html'],
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

// API routes — rate-limit only login/register, not /auth/me
const authRouter = require('./routes/auth');
app.post('/api/auth/login', authLimiter);
app.post('/api/auth/register', authLimiter);
app.use('/api/auth', apiLimiter, authRouter);
app.use('/api/wallet', apiLimiter, require('./routes/wallet'));
app.use('/api/bills', apiLimiter, require('./routes/bills'));
app.use('/api/numbers', apiLimiter, require('./routes/numbers'));
app.use('/api/notifications', apiLimiter, require('./routes/notifications'));
app.use('/api/admin', apiLimiter, require('./routes/admin'));
app.use('/api/contact', apiLimiter, require('./routes/contact'));

// API health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve pages for unmatched routes
app.get('/{*splat}', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    // Serve 404 page for unknown routes
    res.status(404).sendFile(path.join(__dirname, '..', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Nefotech server running at http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
});
