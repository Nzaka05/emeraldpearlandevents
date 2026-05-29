/**
 * tests/security/mpesa.callback.test.js
 *
 * Verifies that the M-Pesa B2C callback endpoint:
 *   1. Rejects non-Safaricom IPs with 403
 *   2. Rejects malformed payloads with 400
 *   3. Accepts valid payloads from allowed IPs with 200
 *
 * Fix verified: Fix 4 — M-Pesa IP allowlist + payload validation
 */

const request = require('supertest');

// Staff system app (port 3001)
const { app } = require('../../staff-system/server');

const CALLBACK_ROUTE = '/portal/admin-staff/mpesa/callback';

// ── Valid payload shape ───────────────────────────────────────────────────────

const VALID_PAYLOAD = {
    Body: {
        stkCallback: {
            MerchantRequestID: 'merchant-req-001',
            CheckoutRequestID: 'checkout-req-001',
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.'
        }
    }
};

// ── IP blocking ───────────────────────────────────────────────────────────────

describe('POST /portal/admin-staff/mpesa/callback — IP allowlist', () => {
    it('returns 403 when request comes from a non-Safaricom IP', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', '1.2.3.4')   // Random non-Safaricom IP
            .send(VALID_PAYLOAD)
            .expect(403);

        expect(res.body.error).toBe('Forbidden');
    });

    it('returns 403 for localhost IP (not in Safaricom allowlist)', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', '127.0.0.1')
            .send(VALID_PAYLOAD)
            .expect(403);

        expect(res.body.error).toBe('Forbidden');
    });

    it('passes IP check for a known Safaricom IP (196.201.214.200)', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', '196.201.214.200')
            .send(VALID_PAYLOAD);

        // IP allowed — should NOT be 403
        expect(res.status).not.toBe(403);
    });

    it('passes IP check for a Safaricom CIDR range IP (196.201.214.50)', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', '196.201.214.50')
            .send(VALID_PAYLOAD);

        expect(res.status).not.toBe(403);
    });

    it('strips IPv4-mapped IPv6 prefix (::ffff:196.201.214.200) correctly', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', '::ffff:196.201.214.200')
            .send(VALID_PAYLOAD);

        expect(res.status).not.toBe(403);
    });
});

// ── Payload validation ────────────────────────────────────────────────────────

describe('POST /portal/admin-staff/mpesa/callback — payload validation', () => {
    // Bypass IP check by using a known Safaricom IP for all payload tests
    const SAFARICOM_IP = '196.201.214.200';

    it('returns 400 when Body is missing entirely', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', SAFARICOM_IP)
            .send({})
            .expect(400);

        expect(res.body.error).toBe('Invalid callback payload');
    });

    it('returns 400 when stkCallback is missing', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', SAFARICOM_IP)
            .send({ Body: {} })
            .expect(400);

        expect(res.body.error).toBe('Invalid callback payload');
    });

    it('returns 400 when MerchantRequestID is not a string', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', SAFARICOM_IP)
            .send({
                Body: {
                    stkCallback: {
                        MerchantRequestID: 12345,        // wrong type
                        CheckoutRequestID: 'checkout-001',
                        ResultCode: 0
                    }
                }
            })
            .expect(400);

        expect(res.body.error).toBe('Invalid callback payload');
    });

    it('returns 400 when CheckoutRequestID is missing', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', SAFARICOM_IP)
            .send({
                Body: {
                    stkCallback: {
                        MerchantRequestID: 'merchant-001',
                        ResultCode: 0
                        // CheckoutRequestID missing
                    }
                }
            })
            .expect(400);

        expect(res.body.error).toBe('Invalid callback payload');
    });

    it('returns 400 when ResultCode is a string instead of number', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', SAFARICOM_IP)
            .send({
                Body: {
                    stkCallback: {
                        MerchantRequestID: 'merchant-001',
                        CheckoutRequestID: 'checkout-001',
                        ResultCode: '0'   // string, not number
                    }
                }
            })
            .expect(400);

        expect(res.body.error).toBe('Invalid callback payload');
    });

    it('returns 200 for a fully valid payload from Safaricom IP', async () => {
        const res = await request(app)
            .post(CALLBACK_ROUTE)
            .set('X-Forwarded-For', SAFARICOM_IP)
            .send(VALID_PAYLOAD)
            .expect(200);

        expect(res.body.success).toBe(true);
    });
});
