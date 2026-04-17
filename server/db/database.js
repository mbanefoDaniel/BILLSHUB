const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
    console.error('FATAL: Missing DATABASE_URL environment variable');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Helper: run a query and return all rows
async function query(text, params = []) {
    return await sql.query(text, params);
}

// Helper: run a query and return first row or null
async function get(text, params = []) {
    const rows = await sql.query(text, params);
    return rows[0] || null;
}

// Helper: run an INSERT/UPDATE/DELETE, return rows if RETURNING used
async function run(text, params = []) {
    return await sql.query(text, params);
}

// Initialize tables
async function initializeDatabase() {
    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password_hash TEXT NOT NULL,
            wallet_balance NUMERIC(12,2) DEFAULT 0,
            role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'banned')),
            reset_token TEXT,
            reset_token_expires TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'failed')),
            reference TEXT UNIQUE NOT NULL,
            provider TEXT,
            meta TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS virtual_numbers (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            number TEXT NOT NULL,
            country TEXT NOT NULL,
            country_code TEXT NOT NULL,
            service TEXT DEFAULT 'any',
            type TEXT DEFAULT 'temporary',
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled', 'completed')),
            price NUMERIC(12,2) NOT NULL,
            expires_at TIMESTAMPTZ,
            meta TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS sms_messages (
            id SERIAL PRIMARY KEY,
            number_id INTEGER NOT NULL REFERENCES virtual_numbers(id),
            sender TEXT NOT NULL,
            message TEXT NOT NULL,
            code TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            read SMALLINT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            admin_id INTEGER NOT NULL REFERENCES users(id),
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            details TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS contact_messages (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            read SMALLINT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_virtual_numbers_user ON virtual_numbers(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sms_number ON sms_messages(number_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_log(admin_id)`;

    // Seed default settings
    const defaultSettings = {
        welcome_bonus: '5000',
        service_fee: '100',
        max_deposit: '5000000',
        site_name: 'Nefotech',
        maintenance_mode: 'false',
        currency: 'NGN',
        currency_symbol: '₦'
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
        await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO NOTHING`;
    }

    // Seed admin user if none exists
    const bcrypt = require('bcryptjs');
    const adminExists = await get("SELECT id FROM users WHERE role = 'admin'");
    if (!adminExists) {
        const hash = bcrypt.hashSync('Admin@123', 12);
        await sql`
            INSERT INTO users (name, email, password_hash, wallet_balance, role, status)
            VALUES ('Admin', 'admin@nefotech.ng', ${hash}, 0, 'admin', 'active')
            ON CONFLICT (email) DO NOTHING
        `;
        console.log('Default admin created: admin@nefotech.ng / Admin@123');
    }

    console.log('Database initialized successfully');
}

module.exports = { sql, query, get, run, initializeDatabase };
