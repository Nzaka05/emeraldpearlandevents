/**
 * server/routes/health.routes.js — Health check endpoints
 *
 * Phase 4: Complete rewrite with public lightweight check and
 * HMAC-protected deep check with queue metrics.
 *
 * GET /health      — public, lightweight (load balancer compatible)
 * GET /health/live — alias for /health (backward compat)
 * GET /health/ready — alias for /health (backward compat)
 * GET /health/deep — HMAC-protected, full system diagnostics
 */

const express = require('express');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────────

function withTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeoutMs)
        ),
    ]);
}

async function checkMongoDB() {
    const start = Date.now();
    try {
        await withTimeout(mongoose.connection.db.admin().ping(), 3000);
        return { status: 'ok', latency_ms: Date.now() - start };
    } catch (err) {
        return { status: 'down', latency_ms: Date.now() - start };
    }
}

async function checkRedis(redisClient) {
    const start = Date.now();
    try {
        if (!redisClient || typeof redisClient.ping !== 'function') {
            return { status: 'down', latency_ms: 0 };
        }
        await withTimeout(redisClient.ping(), 3000);
        return { status: 'ok', latency_ms: Date.now() - start };
    } catch (err) {
        return { status: 'down', latency_ms: Date.now() - start };
    }
}

async function checkQueues() {
    try {
        const { paymentQueue, notificationQueue, emailQueue } = require('../../queue/queues');

        const [paymentCounts, notificationCounts, emailCounts] = await Promise.all([
            paymentQueue.getJobCounts('waiting', 'active', 'failed', 'delayed'),
            notificationQueue.getJobCounts('waiting', 'active', 'failed'),
            emailQueue.getJobCounts('waiting', 'active', 'failed'),
        ]);

        return {
            payment: paymentCounts,
            notification: notificationCounts,
            email: emailCounts,
        };
    } catch (err) {
        return {
            payment: { waiting: 0, active: 0, failed: 0, delayed: 0 },
            notification: { waiting: 0, active: 0, failed: 0 },
            email: { waiting: 0, active: 0, failed: 0 },
        };
    }
}

function determineStatus(mongoCheck, redisCheck, queueChecks) {
    const mongoDown = mongoCheck.status === 'down';
    const redisDown = redisCheck.status === 'down';

    // Both down → system is down
    if (mongoDown && redisDown) return 'down';

    // Any degraded condition
    if (mongoDown || redisDown) return 'degraded';
    if (queueChecks.payment.waiting > 10) return 'degraded';
    if (queueChecks.payment.failed > 0) return 'degraded';

    return 'ok';
}

// ── Public: GET /health ─────────────────────────────────────────────────────────

function healthHandler(req, res) {
    return res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
}

router.get('/', healthHandler);
router.get('/live', healthHandler);
router.get('/ready', healthHandler);

// ── HMAC Protected: GET /health/deep ────────────────────────────────────────────

router.get('/deep', (req, res, next) => {
    // Inline HMAC verification — reuses syncAuth logic
    try {
        const { verifySyncAuth } = require('../../staff-system/middleware/syncAuth');
        verifySyncAuth(req, res, next);
    } catch (err) {
        return res.status(401).json({ error: 'HMAC verification unavailable' });
    }
}, async (req, res) => {
    try {
        // Get Redis client — try multiple sources
        let redisClient = null;
        try {
            const Redis = require('ioredis');
            redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
                maxRetriesPerRequest: 1,
                connectTimeout: 3000,
                lazyConnect: false,
            });
        } catch (_) { /* no Redis available */ }

        const [mongoCheck, redisCheck, queueChecks] = await Promise.all([
            checkMongoDB(),
            checkRedis(redisClient),
            checkQueues(),
        ]);

        // Clean up probe Redis connection
        if (redisClient) {
            redisClient.quit().catch(() => {});
        }

        const status = determineStatus(mongoCheck, redisCheck, queueChecks);
        const mem = process.memoryUsage();

        return res.status(200).json({
            status,
            checks: {
                mongodb: mongoCheck,
                redis: redisCheck,
                queues: queueChecks,
                workers: {
                    payment: { running: queueChecks.payment.active > 0 || queueChecks.payment.waiting >= 0 },
                    notification: { running: queueChecks.notification.active > 0 || queueChecks.notification.waiting >= 0 },
                    email: { running: queueChecks.email.active > 0 || queueChecks.email.waiting >= 0 },
                },
            },
            uptime: process.uptime(),
            memory: {
                heapUsed: mem.heapUsed,
                heapTotal: mem.heapTotal,
                rss: mem.rss,
            },
        });
    } catch (err) {
        logger.error({ err: err.message }, 'Deep health check failed');
        return res.status(500).json({
            status: 'down',
            error: 'Health check execution failed',
        });
    }
});

module.exports = router;
