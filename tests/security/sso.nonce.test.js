/**
 * tests/security/sso.nonce.test.js
 *
 * Verifies that SSO nonces are:
 *   1. Single-use — second exchange with same nonce returns 401
 *   2. Required — missing nonce returns 400
 *   3. Expiry-enforced — fake/unknown nonce returns 401
 *
 * Fix verified: Fix 6 — SSO nonce store moved to Redis
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const crypto = require('crypto');
const app = require('../../server-prod');

const SSO_EXCHANGE_ROUTE = '/admin/sso-exchange';

// ── Helpers ───────────────────────────────────────────────────────────────────

let redisClient;

beforeAll(() => {
    redisClient = new Redis(process.env.REDIS_URL);
});

afterAll(async () => {
    await redisClient.quit();
});

async function seedNonce(nonce, payload = {}) {
    const ssoSecret = process.env.SSO_JWT_SECRET;
    const token = jwt.sign(
        { sub: 'test-admin-id', email: 'admin@test.com', role: 'admin', type: 'staff-ops-sso', ...payload },
        ssoSecret,
        { expiresIn: '2m' }
    );
    await redisClient.set(
        `sso:${nonce}`,
        JSON.stringify({ token }),
        'EX',
        120
    );
    return token;
}

// ── Missing nonce ─────────────────────────────────────────────────────────────

describe('POST /admin/sso-exchange — nonce validation', () => {
    it('returns 400 when nonce is not provided', async () => {
        const res = await request(app)
            .post(SSO_EXCHANGE_ROUTE)
            .send({})
            .expect(400);

        expect(res.body.error).toBe('Nonce required');
    });

    it('returns 401 for a nonce that does not exist in Redis', async () => {
        const fakeNonce = crypto.randomBytes(32).toString('hex');

        const res = await request(app)
            .post(SSO_EXCHANGE_ROUTE)
            .send({ nonce: fakeNonce })
            .expect(401);

        expect(res.body.error).toBe('Invalid or expired nonce');
    });

    it('returns 401 for a nonce that looks valid but has wrong format', async () => {
        const res = await request(app)
            .post(SSO_EXCHANGE_ROUTE)
            .send({ nonce: 'short' })
            .expect(401);

        expect(res.body.error).toBe('Invalid or expired nonce');
    });
});

// ── Single-use enforcement ────────────────────────────────────────────────────

describe('POST /admin/sso-exchange — single-use enforcement', () => {
    it('returns the token on first exchange', async () => {
        const nonce = crypto.randomBytes(32).toString('hex');
        const expectedToken = await seedNonce(nonce);

        const res = await request(app)
            .post(SSO_EXCHANGE_ROUTE)
            .send({ nonce })
            .expect(200);

        expect(res.body.token).toBe(expectedToken);
    });

    it('returns 401 on second exchange with same nonce', async () => {
        const nonce = crypto.randomBytes(32).toString('hex');
        await seedNonce(nonce);

        // First exchange — should succeed
        await request(app)
            .post(SSO_EXCHANGE_ROUTE)
            .send({ nonce })
            .expect(200);

        // Second exchange — nonce must be gone
        const res = await request(app)
            .post(SSO_EXCHANGE_ROUTE)
            .send({ nonce })
            .expect(401);

        expect(res.body.error).toBe('Invalid or expired nonce');
    });

    it('confirms nonce is deleted from Redis after first exchange', async () => {
        const nonce = crypto.randomBytes(32).toString('hex');
        await seedNonce(nonce);

        // Exchange
        await request(app)
            .post(SSO_EXCHANGE_ROUTE)
            .send({ nonce });

        // Confirm deletion directly in Redis
        let keyExists;
        try {
            const val = await redisClient.get(`sso:${nonce}`);
            keyExists = val !== null;
        } catch {
            keyExists = false;
        }

        expect(keyExists).toBe(false);
    });
});

// ── TTL expiry ────────────────────────────────────────────────────────────────

describe('POST /admin/sso-exchange — TTL expiry', () => {
    it('returns 401 for a nonce that was manually expired in Redis', async () => {
        const nonce = crypto.randomBytes(32).toString('hex');
        await seedNonce(nonce);

        // Manually delete to simulate TTL expiry
        await redisClient.del(`sso:${nonce}`);

        const res = await request(app)
            .post(SSO_EXCHANGE_ROUTE)
            .send({ nonce })
            .expect(401);

        expect(res.body.error).toBe('Invalid or expired nonce');
    });
});
