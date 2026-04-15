// ===== VTpass API Service =====
// Docs: https://www.vtpass.com/documentation/
// Sandbox: sandbox.vtpass.com | Live: api-service.vtpass.com

const axios = require('axios');
const crypto = require('crypto');

const VTPASS_BASE = process.env.VTPASS_SANDBOX === 'true'
    ? 'https://sandbox.vtpass.com/api'
    : 'https://api-service.vtpass.com/api';

const vtpassClient = axios.create({
    baseURL: VTPASS_BASE,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000
});

// Add auth to every request
vtpassClient.interceptors.request.use(config => {
    const apiKey = process.env.VTPASS_API_KEY;
    const secretKey = process.env.VTPASS_SECRET_KEY;
    if (!apiKey || !secretKey) {
        throw new Error('VTpass API credentials not configured');
    }
    config.headers['api-key'] = apiKey;
    config.headers['secret-key'] = secretKey;
    return config;
});

// Generate unique request ID
function generateRequestId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = crypto.randomBytes(4).toString('hex');
    return `${dateStr}${timeStr}${rand}`;
}

// Map our provider IDs to VTpass serviceIDs
const SERVICE_MAP = {
    // Electricity (prepaid)
    'ikedc': 'ikeja-electric',
    'ekedc': 'eko-electric',
    'aedc': 'abuja-electric',
    'phedc': 'portharcourt-electric',
    'ibedc': 'ibadan-electric',
    'kedco': 'kaduna-electric',

    // Airtime
    'mtn': 'mtn',
    'airtel': 'airtel',
    'glo': 'glo',
    '9mobile': 'etisalat',  // VTpass uses etisalat for 9mobile

    // Data
    'mtn-data': 'mtn-data',
    'airtel-data': 'airtel-data',
    'glo-data': 'glo-data',
    '9mobile-data': 'etisalat-data',
    'spectranet': 'spectranet',
    'smile': 'smile-direct',

    // TV
    'dstv': 'dstv',
    'gotv': 'gotv',
    'startimes': 'startimes',
    'showmax': 'showmax',

    // Betting (wallet funding)
    'bet9ja': 'bet9ja',
    'sportybet': null, // Not on VTpass
    'betking': null,
    '1xbet': null,

    // Education
    'waec': 'waec',
    'jamb': 'jamb',
    'neco': null
};

// Categories that need meter/smartcard verification first
const VERIFY_CATEGORIES = ['electricity', 'tv'];

const vtpass = {
    /**
     * Verify a meter number or smartcard number
     */
    async verifyAccount(serviceID, billersCode, type = 'prepaid') {
        try {
            const response = await vtpassClient.post('/merchant-verify', {
                billersCode,
                serviceID,
                type
            });
            return response.data;
        } catch (error) {
            console.error('VTpass verify error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.response_description || 'Verification failed');
        }
    },

    /**
     * Get available data variation codes for a service
     */
    async getVariations(serviceID) {
        try {
            const response = await vtpassClient.get(`/service-variations?serviceID=${serviceID}`);
            return response.data;
        } catch (error) {
            console.error('VTpass variations error:', error.response?.data || error.message);
            throw new Error('Failed to fetch service plans');
        }
    },

    /**
     * Purchase airtime
     */
    async buyAirtime(serviceID, phone, amount) {
        const requestId = generateRequestId();
        try {
            const response = await vtpassClient.post('/pay', {
                request_id: requestId,
                serviceID,
                amount,
                phone
            });
            return { ...response.data, request_id: requestId };
        } catch (error) {
            console.error('VTpass airtime error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.response_description || 'Airtime purchase failed');
        }
    },

    /**
     * Purchase data bundle
     */
    async buyData(serviceID, phone, variationCode, amount) {
        const requestId = generateRequestId();
        try {
            const response = await vtpassClient.post('/pay', {
                request_id: requestId,
                serviceID,
                billersCode: phone,
                variation_code: variationCode,
                amount,
                phone
            });
            return { ...response.data, request_id: requestId };
        } catch (error) {
            console.error('VTpass data error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.response_description || 'Data purchase failed');
        }
    },

    /**
     * Pay electricity bill
     */
    async payElectricity(serviceID, meterNumber, amount, phone, type = 'prepaid') {
        const requestId = generateRequestId();
        try {
            const response = await vtpassClient.post('/pay', {
                request_id: requestId,
                serviceID,
                billersCode: meterNumber,
                variation_code: type,
                amount,
                phone
            });
            return { ...response.data, request_id: requestId };
        } catch (error) {
            console.error('VTpass electricity error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.response_description || 'Electricity payment failed');
        }
    },

    /**
     * Pay TV subscription
     */
    async payTV(serviceID, smartcardNumber, variationCode, amount, phone) {
        const requestId = generateRequestId();
        try {
            const response = await vtpassClient.post('/pay', {
                request_id: requestId,
                serviceID,
                billersCode: smartcardNumber,
                variation_code: variationCode,
                amount,
                phone
            });
            return { ...response.data, request_id: requestId };
        } catch (error) {
            console.error('VTpass TV error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.response_description || 'TV subscription failed');
        }
    },

    /**
     * Fund betting wallet
     */
    async fundBetting(serviceID, customerId, amount) {
        const requestId = generateRequestId();
        try {
            const response = await vtpassClient.post('/pay', {
                request_id: requestId,
                serviceID,
                billersCode: customerId,
                variation_code: serviceID,
                amount
            });
            return { ...response.data, request_id: requestId };
        } catch (error) {
            console.error('VTpass betting error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.response_description || 'Betting wallet funding failed');
        }
    },

    /**
     * Buy education pin (WAEC, JAMB)
     */
    async buyEducation(serviceID, variationCode, amount) {
        const requestId = generateRequestId();
        try {
            const response = await vtpassClient.post('/pay', {
                request_id: requestId,
                serviceID,
                billersCode: '0000',
                variation_code: variationCode,
                amount
            });
            return { ...response.data, request_id: requestId };
        } catch (error) {
            console.error('VTpass education error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.response_description || 'Education pin purchase failed');
        }
    },

    /**
     * Query transaction status
     */
    async queryTransaction(requestId) {
        try {
            const response = await vtpassClient.post('/requery', {
                request_id: requestId
            });
            return response.data;
        } catch (error) {
            console.error('VTpass requery error:', error.response?.data || error.message);
            throw new Error('Failed to query transaction');
        }
    },

    // Expose helpers
    SERVICE_MAP,
    VERIFY_CATEGORIES,
    generateRequestId
};

module.exports = vtpass;
