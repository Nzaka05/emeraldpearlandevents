// ═══════════════════════════════════════════════════════════
// PAYSTACK SERVICE — Node.js built-in https (no extra SDK)
// ═══════════════════════════════════════════════════════════

const https = require('https');

/**
 * Helper: make an HTTPS request to Paystack API.
 * Resolves with parsed JSON body, rejects on network / non-2xx errors.
 */
const paystackRequest = (method, path, data = null) => {
    return new Promise((resolve, reject) => {
        const payload = data ? JSON.stringify(data) : null;

        const options = {
            hostname: 'api.paystack.co',
            port: 443,
            path,
            method,
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 200 && res.statusCode < 300 && parsed.status) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.message || `Paystack API error (${res.statusCode})`));
                    }
                } catch (err) {
                    reject(new Error(`Failed to parse Paystack response: ${body.substring(0, 200)}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Paystack API request timed out'));
        });

        if (payload) req.write(payload);
        req.end();
    });
};

// ─────────────────────────────────────────────────────────────
// Initialize a Paystack transaction (client pays)
// ─────────────────────────────────────────────────────────────
/**
 * @param {Object} opts
 * @param {Object} opts.booking    – Mongoose booking document (with populated customerId)
 * @param {string} opts.currency   – 'KES' or 'USD'
 * @param {string} opts.callbackUrl – URL Paystack redirects to after payment
 * @returns {{ authorization_url, access_code, reference }}
 */
exports.initializeTransaction = async ({ booking, currency, callbackUrl }) => {
    const amountInSmallestUnit = Math.round(booking.estimatedTotal * 100); // kobo / cents

    const customer = booking.customerId; // populated ref

    const result = await paystackRequest('POST', '/transaction/initialize', {
        email: customer.email,
        amount: amountInSmallestUnit,
        currency: currency.toUpperCase(),
        callback_url: callbackUrl,
        reference: `EPE-${booking._id}-${Date.now()}`,
        metadata: {
            booking_id: booking._id.toString(),
            client_id: customer._id.toString(),
            booking_ref: booking.bookingReference
        }
    });

    return result.data; // { authorization_url, access_code, reference }
};

// ─────────────────────────────────────────────────────────────
// Verify a Paystack transaction by reference
// ─────────────────────────────────────────────────────────────
/**
 * @param {string} reference – Paystack transaction reference
 * @returns {Object} Paystack verification payload (.data from API)
 */
exports.verifyTransaction = async (reference) => {
    const result = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    return result.data;
};
