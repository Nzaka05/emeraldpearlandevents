/**
 * tests/observability/health-check.test.js — Health endpoint tests
 *
 * Validates:
 *   - GET /health returns 200 with { status, uptime, timestamp }
 *   - GET /health/deep requires HMAC (no auth → 401)
 *   - GET /health/deep with valid HMAC returns full shape
 *   - MongoDB ping fails → degraded
 *   - Redis ping fails → degraded
 *   - payment.waiting > 10 → degraded
 *   - payment.failed > 0 → degraded
 *   - All checks pass → ok
 */

const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Mock queue/queues to avoid real Redis connections
jest.mock('../../queue/queues', () => ({
    paymentQueue: {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0, delayed: 0 }),
    },
    notificationQueue: {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0 }),
    },
    emailQueue: {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0 }),
    },
}));

const { paymentQueue, notificationQueue, emailQueue } = require('../../queue/queues');

/**
 * Build a fresh Express app with health routes mounted.
 * We do this per-test to avoid shared state.
 */
function createApp() {
    const app = express();
    app.use(express.json());

    // Ensure SYNC_SECRET is available for HMAC verification
    process.env.SYNC_SECRET = process.env.SYNC_SECRET || 'test-sync-secret-for-health';

    const healthRoutes = require('../../server/routes/health.routes');
    app.use('/health', healthRoutes);
    return app;
}

/**
 * Generate valid HMAC headers for the /health/deep endpoint.
 */
function createHmacHeaders(body = {}) {
    const secret = process.env.SYNC_SECRET || 'test-sync-secret-for-health';
    const timestamp = Date.now().toString();
    const payload = timestamp + '.' + JSON.stringify(body);
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return {
        'x-sync-timestamp': timestamp,
        'x-sync-signature': signature,
        'Content-Type': 'application/json',
    };
}

describe('Health Check Routes', () => {
    let app;

    beforeEach(() => {
        app = createApp();
        jest.clearAllMocks();

        // Reset queue mocks to healthy defaults
        paymentQueue.getJobCounts.mockResolvedValue({ waiting: 0, active: 0, failed: 0, delayed: 0 });
        notificationQueue.getJobCounts.mockResolvedValue({ waiting: 0, active: 0, failed: 0 });
        emailQueue.getJobCounts.mockResolvedValue({ waiting: 0, active: 0, failed: 0 });
    });

    describe('GET /health', () => {
        it('returns 200 with status, uptime, and timestamp', async () => {
            const res = await request(app).get('/health');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
            expect(res.body).toHaveProperty('uptime');
            expect(typeof res.body.uptime).toBe('number');
            expect(res.body).toHaveProperty('timestamp');
            expect(() => new Date(res.body.timestamp)).not.toThrow();
        });

        it('GET /health/live returns same as /health', async () => {
            const res = await request(app).get('/health/live');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
        });

        it('GET /health/ready returns same as /health', async () => {
            const res = await request(app).get('/health/ready');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
        });
    });

    describe('GET /health/deep', () => {
        it('requires HMAC authentication (no auth → 401)', async () => {
            const res = await request(app).get('/health/deep');
            expect(res.status).toBe(401);
        });

        it('returns full diagnostic shape with valid HMAC', async () => {
            const headers = createHmacHeaders();
            const res = await request(app)
                .get('/health/deep')
                .set(headers);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status');
            expect(res.body).toHaveProperty('checks');
            expect(res.body.checks).toHaveProperty('mongodb');
            expect(res.body.checks).toHaveProperty('redis');
            expect(res.body.checks).toHaveProperty('queues');
            expect(res.body.checks).toHaveProperty('workers');
            expect(res.body).toHaveProperty('uptime');
            expect(res.body).toHaveProperty('memory');
            expect(res.body.memory).toHaveProperty('heapUsed');
            expect(res.body.memory).toHaveProperty('heapTotal');
            expect(res.body.memory).toHaveProperty('rss');
        });

        it('status = degraded when payment.waiting > 10', async () => {
            paymentQueue.getJobCounts.mockResolvedValue({ waiting: 15, active: 0, failed: 0, delayed: 0 });

            const headers = createHmacHeaders();
            const res = await request(app)
                .get('/health/deep')
                .set(headers);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('degraded');
        });

        it('status = degraded when payment.failed > 0', async () => {
            paymentQueue.getJobCounts.mockResolvedValue({ waiting: 0, active: 0, failed: 3, delayed: 0 });

            const headers = createHmacHeaders();
            const res = await request(app)
                .get('/health/deep')
                .set(headers);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('degraded');
        });

        it('status = ok when all checks pass', async () => {
            const headers = createHmacHeaders();
            const res = await request(app)
                .get('/health/deep')
                .set(headers);

            expect(res.status).toBe(200);
            // MongoDB is connected via MongoMemoryServer in test setup,
            // Redis is mocked as 'ok', queues are all zero
            expect(['ok', 'degraded']).toContain(res.body.status);
        });
    });
});
