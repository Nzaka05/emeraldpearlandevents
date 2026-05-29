/**
 * tests/security/booking.routes.test.js
 *
 * Verifies that GET /api/v1/booking/:id and
 * PATCH /api/v1/booking/:id/status are protected by adminAuth.
 *
 * Fix verified: Fix 1 — Lock down booking routes
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server-prod');

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_BOOKING_ID = new mongoose.Types.ObjectId().toString();

function makeAdminToken(overrides = {}) {
    return jwt.sign(
        { adminId: new mongoose.Types.ObjectId().toString(), email: 'admin@test.com', role: 'admin', ...overrides },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
}

// ── GET /api/v1/booking/:id ───────────────────────────────────────────────────

describe('GET /api/v1/booking/:id', () => {
    it('returns 401 when no auth token is provided', async () => {
        const res = await request(app)
            .get(`/api/v1/booking/${FAKE_BOOKING_ID}`)
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('returns 401 when a malformed token is provided', async () => {
        const res = await request(app)
            .get(`/api/v1/booking/${FAKE_BOOKING_ID}`)
            .set('Authorization', 'Bearer not-a-real-token')
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('returns 401 when token is signed with wrong secret', async () => {
        const badToken = jwt.sign(
            { adminId: 'abc', email: 'x@x.com', role: 'admin' },
            'wrong-secret',
            { expiresIn: '1h' }
        );

        const res = await request(app)
            .get(`/api/v1/booking/${FAKE_BOOKING_ID}`)
            .set('Cookie', `adminToken=${badToken}`)
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('passes auth gate with a valid admin token (may 404 on booking not found)', async () => {
        const token = makeAdminToken();

        const res = await request(app)
            .get(`/api/v1/booking/${FAKE_BOOKING_ID}`)
            .set('Cookie', `adminToken=${token}`);

        // Auth passed — either 404 (booking not found) or 200 are both acceptable
        expect([200, 404]).toContain(res.status);
    });

    it('returns 400 for an invalid ObjectId format', async () => {
        const token = makeAdminToken();

        const res = await request(app)
            .get('/api/v1/booking/not-an-id')
            .set('Cookie', `adminToken=${token}`)
            .expect(400);

        expect(res.body.success).toBe(false);
    });
});

// ── PATCH /api/v1/booking/:id/status ─────────────────────────────────────────

describe('PATCH /api/v1/booking/:id/status', () => {
    it('returns 401 when no auth token is provided', async () => {
        const res = await request(app)
            .patch(`/api/v1/booking/${FAKE_BOOKING_ID}/status`)
            .send({ status: 'confirmed' })
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('returns 401 when token is expired', async () => {
        const expiredToken = jwt.sign(
            { adminId: 'abc', email: 'x@x.com', role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '-1s' }
        );

        const res = await request(app)
            .patch(`/api/v1/booking/${FAKE_BOOKING_ID}/status`)
            .set('Cookie', `adminToken=${expiredToken}`)
            .send({ status: 'confirmed' })
            .expect(401);

        expect(res.body.success).toBe(false);
    });

    it('passes auth gate with valid token and rejects bad status value', async () => {
        const token = makeAdminToken();

        const res = await request(app)
            .patch(`/api/v1/booking/${FAKE_BOOKING_ID}/status`)
            .set('Cookie', `adminToken=${token}`)
            .send({ status: 'invalid_status' });

        // Auth passed — 400 for bad status or 404 for booking not found
        expect([400, 404]).toContain(res.status);
    });
});
