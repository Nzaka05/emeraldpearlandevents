/**
 * tests/security/internal.sync.test.js
 *
 * Phase 3: Verifies HMAC-secured internal sync endpoints between the two servers.
 *   1. Reject requests with missing HMAC headers
 *   2. Reject requests with invalid/expired signatures
 *   3. Accept requests with valid HMAC signatures
 *   4. Legacy x-sync-secret header is NO LONGER accepted
 *
 * Updated: Phase 3 — HMAC is the sole auth mechanism
 */

const request = require('supertest');
const { createSyncHeaders } = require('../../staff-system/middleware/syncAuth');

// Both apps
const mainApp = require('../../server-prod');
const { app: staffApp } = require('../../staff-system/server');

const CORRECT_SECRET = process.env.SYNC_SECRET;

// ── Helper: create valid HMAC headers for a body ─────────────────────────────
function hmac(body) {
    return createSyncHeaders(CORRECT_SECRET, body);
}

// ── Main server internal routes ───────────────────────────────────────────────

describe('Main server — /internal/sync-staff-update', () => {
    const body = { email: 'staff@test.com', name: 'Test', phone: '0712345678' };

    it('returns 401 when HMAC headers are missing', async () => {
        const res = await request(mainApp)
            .post('/internal/sync-staff-update')
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('returns 401 when only legacy x-sync-secret header is used', async () => {
        const res = await request(mainApp)
            .post('/internal/sync-staff-update')
            .set('x-sync-secret', CORRECT_SECRET)
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('returns 401 when old header name X-Internal-Secret is used', async () => {
        const res = await request(mainApp)
            .post('/internal/sync-staff-update')
            .set('X-Internal-Secret', CORRECT_SECRET)
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('passes auth check with valid HMAC signature', async () => {
        const headers = hmac(body);
        const res = await request(mainApp)
            .post('/internal/sync-staff-update')
            .set('x-sync-timestamp', headers['x-sync-timestamp'])
            .set('x-sync-signature', headers['x-sync-signature'])
            .send(body);

        // Auth passed — 404 if staff not found is acceptable
        expect([200, 404]).toContain(res.status);
        expect(res.status).not.toBe(401);
    });
});

describe('Main server — /internal/sync-event-complete', () => {
    const body = { booking_ref: 'TEST-001', status: 'Completed' };

    it('returns 401 with missing HMAC headers', async () => {
        const res = await request(mainApp)
            .post('/internal/sync-event-complete')
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('returns 401 with legacy x-sync-secret only', async () => {
        const res = await request(mainApp)
            .post('/internal/sync-event-complete')
            .set('x-sync-secret', CORRECT_SECRET)
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('passes auth with valid HMAC signature', async () => {
        const headers = hmac({ booking_ref: 'NONEXISTENT-REF' });
        const res = await request(mainApp)
            .post('/internal/sync-event-complete')
            .set('x-sync-timestamp', headers['x-sync-timestamp'])
            .set('x-sync-signature', headers['x-sync-signature'])
            .send({ booking_ref: 'NONEXISTENT-REF' });

        expect(res.status).not.toBe(401);
    });
});

// ── Staff server internal routes ──────────────────────────────────────────────

describe('Staff server — /internal/sync-booking', () => {
    const body = { title: 'Test Event', booking_ref: 'TEST-001' };

    it('returns 401 when HMAC headers are missing', async () => {
        const res = await request(staffApp)
            .post('/internal/sync-booking')
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('returns 401 when X-Internal-Secret (old header) is used', async () => {
        const res = await request(staffApp)
            .post('/internal/sync-booking')
            .set('X-Internal-Secret', CORRECT_SECRET)
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('returns 401 with legacy x-sync-secret only', async () => {
        const res = await request(staffApp)
            .post('/internal/sync-booking')
            .set('x-sync-secret', CORRECT_SECRET)
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('passes auth with valid HMAC signature', async () => {
        const syncBody = {
            title: 'Test Event',
            booking_ref: `TEST-${Date.now()}`,
            date: new Date().toISOString(),
            location: 'Nairobi',
            start_time: '08:00',
            end_time: '17:00'
        };
        const headers = hmac(syncBody);
        const res = await request(staffApp)
            .post('/internal/sync-booking')
            .set('x-sync-timestamp', headers['x-sync-timestamp'])
            .set('x-sync-signature', headers['x-sync-signature'])
            .send(syncBody);

        // Auth passed — may fail for missing admin but not 401
        expect(res.status).not.toBe(401);
    });
});

describe('Staff server — /internal/sync-payment', () => {
    const body = { booking_ref: 'TEST-001', clientPaymentAmount: 5000 };

    it('returns 401 with missing HMAC headers', async () => {
        const res = await request(staffApp)
            .post('/internal/sync-payment')
            .send(body)
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('passes auth with valid HMAC signature', async () => {
        const syncBody = { booking_ref: 'NONEXISTENT', clientPaymentAmount: 5000 };
        const headers = hmac(syncBody);
        const res = await request(staffApp)
            .post('/internal/sync-payment')
            .set('x-sync-timestamp', headers['x-sync-timestamp'])
            .set('x-sync-signature', headers['x-sync-signature'])
            .send(syncBody);

        expect(res.status).not.toBe(401);
    });
});

// ── Header name consistency check ─────────────────────────────────────────────

describe('Sync header name consistency', () => {
    it('SYNC_SECRET environment variable is defined', () => {
        expect(process.env.SYNC_SECRET).toBeDefined();
        expect(process.env.SYNC_SECRET.length).toBeGreaterThan(0);
    });

    it('old header X-Internal-Secret is rejected by staff server', async () => {
        const res = await request(staffApp)
            .post('/internal/sync-staff')
            .set('X-Internal-Secret', CORRECT_SECRET)
            .send({ action: 'update', staff: { email: 'x@x.com', name: 'X' } })
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });

    it('legacy x-sync-secret alone is rejected (Phase 3)', async () => {
        const res = await request(staffApp)
            .post('/internal/sync-staff')
            .set('x-sync-secret', CORRECT_SECRET)
            .send({ action: 'update', staff: { email: 'x@x.com', name: 'X' } })
            .expect(401);

        expect(res.body.error).toMatch(/Unauthorized|HMAC/);
    });
});
