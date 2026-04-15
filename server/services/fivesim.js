// ===== 5sim.net API Service =====
// API Docs: https://docs.5sim.net/
// Base URL: https://5sim.net/v1
// Auth: Bearer token in Authorization header

const axios = require('axios');

const FIVESIM_BASE = 'https://5sim.net/v1';

const fivesimClient = axios.create({
    baseURL: FIVESIM_BASE,
    headers: {
        'Accept': 'application/json'
    },
    timeout: 30000
});

// Add auth to every request
fivesimClient.interceptors.request.use(config => {
    const apiKey = process.env.FIVESIM_API_KEY;
    if (!apiKey) {
        throw new Error('5sim API key not configured');
    }
    config.headers['Authorization'] = `Bearer ${apiKey}`;
    return config;
});

// Map our country IDs to 5sim country names
const COUNTRY_MAP = {
    us: 'usa',
    uk: 'england',
    ca: 'canada',
    de: 'germany',
    fr: 'france',
    nl: 'netherlands',
    es: 'spain',
    it: 'italy',
    pt: 'portugal',
    se: 'sweden',
    pl: 'poland',
    cz: 'czech',
    at: 'austria',
    ro: 'romania',
    ua: 'ukraine',
    ru: 'russia',
    in: 'india',
    id: 'indonesia',
    ph: 'philippines',
    th: 'thailand',
    my: 'malaysia',
    vn: 'vietnam',
    cn: 'china',
    hk: 'hongkong',
    kr: 'southkorea',
    jp: 'japan',
    au: 'australia',
    nz: 'newzealand',
    br: 'brazil',
    mx: 'mexico',
    ar: 'argentina',
    co: 'colombia',
    cl: 'chile',
    ng: 'nigeria',
    za: 'southafrica',
    gh: 'ghana',
    ke: 'kenya',
    eg: 'egypt',
    tz: 'tanzania',
    tr: 'turkey',
    ae: 'uae',
    sa: 'saudiarabia',
    il: 'israel',
    pk: 'pakistan',
    bd: 'bangladesh',
};

// Map service names to 5sim product names
const SERVICE_MAP = {
    whatsapp: 'whatsapp',
    google: 'google',
    telegram: 'telegram',
    facebook: 'facebook',
    twitter: 'twitter',
    instagram: 'instagram',
    amazon: 'amazon',
    uber: 'uber',
    paypal: 'paypal',
    signal: 'signal',
    discord: 'discord',
    tiktok: 'tiktok',
    snapchat: 'snapchat',
    linkedin: 'linkedin',
    microsoft: 'microsoft',
    yahoo: 'yahoo',
    any: 'any'
};

const fivesim = {
    /**
     * Get user profile / balance info
     */
    async getProfile() {
        try {
            const response = await fivesimClient.get('/user/profile');
            return response.data;
        } catch (error) {
            console.error('5sim profile error:', error.response?.data || error.message);
            throw new Error('Failed to fetch 5sim profile');
        }
    },

    /**
     * Get available products/prices for a country
     * Returns pricing and availability for each service in the country
     */
    async getPrices(country, product) {
        try {
            const fivesimCountry = COUNTRY_MAP[country] || country;
            const fivesimProduct = SERVICE_MAP[product] || product || 'any';
            const response = await fivesimClient.get(`/guest/prices?country=${fivesimCountry}&product=${fivesimProduct}`);
            return response.data;
        } catch (error) {
            console.error('5sim prices error:', error.response?.data || error.message);
            throw new Error('Failed to fetch prices');
        }
    },

    /**
     * Buy an activation number
     * @param {string} country - Our country ID (us, uk, ng, etc.)
     * @param {string} product - Service name (whatsapp, google, etc.)
     * @param {string} operator - Operator preference ('any' for default)
     * @returns {object} - { id, phone, operator, product, price, status, expires, sms, country }
     */
    async buyNumber(country, product, operator = 'any') {
        try {
            const fivesimCountry = COUNTRY_MAP[country] || country;
            const fivesimProduct = SERVICE_MAP[product] || product || 'any';

            const response = await fivesimClient.get(
                `/user/buy/activation/${fivesimCountry}/${operator}/${fivesimProduct}`
            );
            return response.data;
        } catch (error) {
            const errMsg = error.response?.data?.message || error.response?.data || error.message;
            console.error('5sim buy error:', errMsg);

            if (error.response?.status === 400) {
                throw new Error('No numbers available for this country/service. Try another.');
            }
            if (error.response?.status === 402) {
                throw new Error('Insufficient 5sim balance. Contact admin.');
            }
            throw new Error(typeof errMsg === 'string' ? errMsg : 'Failed to purchase number');
        }
    },

    /**
     * Check order status and get SMS
     * @param {number} orderId - The 5sim order ID
     * @returns {object} - { id, phone, status, sms: [{created_at, date, sender, text, code}], ... }
     */
    async checkOrder(orderId) {
        try {
            const response = await fivesimClient.get(`/user/check/${orderId}`);
            return response.data;
        } catch (error) {
            console.error('5sim check error:', error.response?.data || error.message);
            throw new Error('Failed to check order status');
        }
    },

    /**
     * Finish order (confirm SMS received, mark as done)
     * @param {number} orderId
     */
    async finishOrder(orderId) {
        try {
            const response = await fivesimClient.get(`/user/finish/${orderId}`);
            return response.data;
        } catch (error) {
            console.error('5sim finish error:', error.response?.data || error.message);
            throw new Error('Failed to finish order');
        }
    },

    /**
     * Cancel order (if no SMS received, get refund)
     * @param {number} orderId
     */
    async cancelOrder(orderId) {
        try {
            const response = await fivesimClient.get(`/user/cancel/${orderId}`);
            return response.data;
        } catch (error) {
            console.error('5sim cancel error:', error.response?.data || error.message);
            throw new Error('Failed to cancel order');
        }
    },

    /**
     * Ban order (report number as not working)
     * @param {number} orderId
     */
    async banOrder(orderId) {
        try {
            const response = await fivesimClient.get(`/user/ban/${orderId}`);
            return response.data;
        } catch (error) {
            console.error('5sim ban error:', error.response?.data || error.message);
            throw new Error('Failed to ban order');
        }
    },

    /**
     * Get list of available countries
     */
    async getCountries() {
        try {
            const response = await fivesimClient.get('/guest/countries');
            return response.data;
        } catch (error) {
            console.error('5sim countries error:', error.response?.data || error.message);
            throw new Error('Failed to fetch countries');
        }
    },

    /**
     * Get available products (services) for a country
     */
    async getProducts(country) {
        try {
            const fivesimCountry = COUNTRY_MAP[country] || country;
            const response = await fivesimClient.get(`/guest/products/${fivesimCountry}/any`);
            return response.data;
        } catch (error) {
            console.error('5sim products error:', error.response?.data || error.message);
            throw new Error('Failed to fetch products');
        }
    },

    // Expose maps
    COUNTRY_MAP,
    SERVICE_MAP
};

module.exports = fivesim;
