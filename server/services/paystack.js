// ===== Paystack Payment Service =====
// Docs: https://paystack.com/docs/api/
// Handles wallet funding via card, bank transfer, USSD

const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_BASE = 'https://api.paystack.co';

const paystackClient = axios.create({
    baseURL: PAYSTACK_BASE,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000
});

// Add auth to every request
paystackClient.interceptors.request.use(config => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
        throw new Error('Paystack secret key not configured');
    }
    config.headers['Authorization'] = `Bearer ${secretKey}`;
    return config;
});

const paystack = {
    /**
     * Initialize a transaction — returns an authorization URL
     * User is redirected to Paystack checkout page
     */
    async initializeTransaction(email, amountInKobo, metadata = {}, callbackUrl = null) {
        try {
            const payload = {
                email,
                amount: amountInKobo, // Paystack uses kobo (₦1 = 100 kobo)
                currency: 'NGN',
                metadata: {
                    ...metadata,
                    custom_fields: [
                        {
                            display_name: 'Payment Type',
                            variable_name: 'payment_type',
                            value: 'wallet_funding'
                        }
                    ]
                }
            };

            if (callbackUrl) {
                payload.callback_url = callbackUrl;
            }

            // Add channels based on preference
            payload.channels = ['card', 'bank', 'ussd', 'bank_transfer'];

            const response = await paystackClient.post('/transaction/initialize', payload);
            return response.data;
        } catch (error) {
            console.error('Paystack init error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to initialize payment');
        }
    },

    /**
     * Verify a transaction by reference
     */
    async verifyTransaction(reference) {
        try {
            const response = await paystackClient.get(`/transaction/verify/${encodeURIComponent(reference)}`);
            return response.data;
        } catch (error) {
            console.error('Paystack verify error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to verify transaction');
        }
    },

    /**
     * List banks for bank transfer
     */
    async listBanks() {
        try {
            const response = await paystackClient.get('/bank?currency=NGN');
            return response.data;
        } catch (error) {
            console.error('Paystack banks error:', error.response?.data || error.message);
            throw new Error('Failed to fetch banks');
        }
    },

    /**
     * Validate webhook signature
     * Paystack sends a hash in x-paystack-signature header
     */
    validateWebhook(body, signature) {
        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!secretKey) return false;

        const hash = crypto
            .createHmac('sha512', secretKey)
            .update(JSON.stringify(body))
            .digest('hex');

        return hash === signature;
    },

    /**
     * Create a dedicated virtual account for a customer
     */
    async createDedicatedAccount(customerCode) {
        try {
            const response = await paystackClient.post('/dedicated_account', {
                customer: customerCode,
                preferred_bank: 'wema-bank'
            });
            return response.data;
        } catch (error) {
            console.error('Paystack DVA error:', error.response?.data || error.message);
            throw new Error('Failed to create virtual account');
        }
    },

    /**
     * Create or fetch a Paystack customer
     */
    async createCustomer(email, firstName, lastName, phone) {
        try {
            const response = await paystackClient.post('/customer', {
                email,
                first_name: firstName,
                last_name: lastName,
                phone
            });
            return response.data;
        } catch (error) {
            console.error('Paystack customer error:', error.response?.data || error.message);
            throw new Error('Failed to create customer');
        }
    }
};

module.exports = paystack;
