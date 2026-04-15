const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'nefotech.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        wallet_balance REAL DEFAULT 0,
        role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'banned')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'failed')),
        reference TEXT UNIQUE NOT NULL,
        provider TEXT,
        meta TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS virtual_numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        number TEXT NOT NULL,
        country TEXT NOT NULL,
        country_code TEXT NOT NULL,
        service TEXT DEFAULT 'any',
        type TEXT DEFAULT 'temporary',
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled', 'completed')),
        price REAL NOT NULL,
        expires_at DATETIME,
        meta TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sms_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (number_id) REFERENCES virtual_numbers(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_virtual_numbers_user ON virtual_numbers(user_id);
    CREATE INDEX IF NOT EXISTS idx_sms_number ON sms_messages(number_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_log(admin_id);
`);

// Migrate: add role/status columns if missing (for existing DBs)
try {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
} catch (e) { /* column already exists */ }
try {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`);
} catch (e) { /* column already exists */ }
try {
    db.exec(`ALTER TABLE virtual_numbers ADD COLUMN meta TEXT`);
} catch (e) { /* column already exists */ }
try {
    db.exec(`ALTER TABLE sms_messages ADD COLUMN code TEXT`);
} catch (e) { /* column already exists */ }

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

const upsertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [key, value] of Object.entries(defaultSettings)) {
    upsertSetting.run(key, value);
}

// Seed admin user if none exists
const bcrypt = require('bcryptjs');
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
if (!adminExists) {
    const hash = bcrypt.hashSync('Admin@123', 12);
    db.prepare(
        "INSERT OR IGNORE INTO users (name, email, password_hash, wallet_balance, role, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run('Admin', 'admin@nefotech.ng', hash, 0, 'admin', 'active');
    console.log('Default admin created: admin@nefotech.ng / Admin@123');
}

module.exports = db;
