/**
 * tests/security/staff.auth.test.js
 *
 * Verifies that the staff portal auth middleware ONLY accepts tokens
 * signed with STAFF_JWT_SECRET, and rejects tokens signed with
 * the main JWT_SECRET.
 *
 * Fix verified: Fix 3 — Staff JWT fallback removed
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { app } = require('../../staff-system/server');

// Any protected staff route — dashboard is the simplest target
const PROTECTED_ROUTE = '/portal/staff/dashboard';
const PROTECTED_ADMIN_ROUTE = '/portal/admin-staff/dashboard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(secret, payload = {}) {
    return jwt.sign(
        { id: new mongoose.Types.ObjectId().toString(), role: 'Staff', ...payload },
        secret,
        { expiresIn: '1h' }
    );
}

// ── Main JWT_SECRET rejection ─────────────────────────────────────────────────

describe('Staff portal — JWT secret isolation', () => {
    it('rejects a token signed with JWT_SECRET (main server secret)', async () => {
        const mainToken = makeToken(process.env.JWT_SECRET);

        const res = await request(app)
            .get(PROTECTED_ROUTE)
            .set('Cookie', `staff_portal_token=${mainToken}`);

        // Must NOT pass auth — 401 or redirect to login
        expect([401, 302]).toContain(res.status);

        // If JSON response, check success flag
        if (res.status === 401) {
            expect(res.body.success).toBe(false);
        }
    });

    it('rejects a token signed with JWT_SECRET via Bearer header', async () => {
        const mainToken = makeToken(process.env.JWT_SECRET);

        const res = await request(app)
            .get(PROTECTED_ROUTE)
            .set('Authorization', `Bearer ${mainToken}`);

        expect([401, 302]).toContain(res.status);
    });

    it('rejects a token signed with a random unknown secret', async () => {
        const badToken = makeToken('completely-wrong-secret-xyz-123');

        const res = await request(app)
            .get(PROTECTED_ROUTE)
            .set('Cookie', `staff_portal_token=${badToken}`);

        expect([401, 302]).toContain(res.status);
    });

    it('rejects an expired STAFF_JWT_SECRET token', async () => {
        const expiredToken = jwt.sign(
            { id: new mongoose.Types.ObjectId().toString(), role: 'Staff' },
            process.env.STAFF_JWT_SECRET,
            { expiresIn: '-1s' }
        );

        const res = await request(app)
            .get(PROTECTED_ROUTE)
            .set('Cookie', `staff_portal_token=${expiredToken}`);

        expect([401, 302]).toContain(res.status);
    });

    it('rejects a request with no token at all', async () => {
        const res = await request(app)
            .get(PROTECTED_ROUTE);

        expect([401, 302]).toContain(res.status);
    });

    it('rejects a malformed token string', async () => {
        const res = await request(app)
            .get(PROTECTED_ROUTE)
            .set('Cookie', 'staff_portal_token=this.is.not.a.jwt');

        expect([401, 302]).toContain(res.status);
    });
});

// ── STAFF_JWT_SECRET acceptance ───────────────────────────────────────────────

describe('Staff portal — valid STAFF_JWT_SECRET token passes auth gate', () => {
    it('passes the auth middleware with a valid STAFF_JWT_SECRET token', async () => {
        // This test confirms the correct secret still works.
        // The route may 404 if no matching staff in DB — that is acceptable.
        const validToken = makeToken(process.env.STAFF_JWT_SECRET);

        const res = await request(app)
            .get(PROTECTED_ROUTE)
            .set('Cookie', `staff_portal_token=${validToken}`);

        // Should NOT be 401 — auth passed even if user not found (404/302 to dashboard)
        expect(res.status).not.toBe(401);
    });
});

// ── JWT_SECRET != STAFF_JWT_SECRET guard ──────────────────────────────────────

describe('Environment sanity — secrets must be different', () => {
    it('JWT_SECRET and STAFF_JWT_SECRET are not the same value', () => {
        expect(process.env.JWT_SECRET).toBeDefined();
        expect(process.env.STAFF_JWT_SECRET).toBeDefined();
        expect(process.env.JWT_SECRET).not.toBe(process.env.STAFF_JWT_SECRET);
    });
});
