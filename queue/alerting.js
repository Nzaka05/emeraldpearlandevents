/**
 * queue/alerting.js — Alert emission with Redis-based deduplication
 *
 * Phase 4: Emits alerts via systemEventsQueue with 5-minute dedup
 * using Redis TTL keys. This ensures alerts are deduplicated across
 * ALL PM2 processes (workers are separate processes — in-memory
 * state is not shared).
 *
 * Usage:
 *   const { emitAlert, AlertTypes } = require('./queue/alerting');
 *   await emitAlert(AlertTypes.PAYMENT_QUEUE_BACKED_UP, 'high', { waiting: 15 }, redisClient);
 */

const { createEnvelope, Sources } = require('./events');

// ── Alert Type Constants ────────────────────────────────────────────────────────

const AlertTypes = {
    PAYMENT_QUEUE_BACKED_UP: 'PAYMENT_QUEUE_BACKED_UP',
    PAYMENT_FAILURE_SPIKE: 'PAYMENT_FAILURE_SPIKE',
    HMAC_FAILURE_SPIKE: 'HMAC_FAILURE_SPIKE',
    WORKER_DOWN: 'WORKER_DOWN',
    DLQ_INSERTION_ALERT: 'DLQ_INSERTION_ALERT',
};

// Dedup TTL: 5 minutes (300 seconds)
const ALERT_DEDUP_TTL = 300;

/**
 * Emit an alert via systemEventsQueue with Redis-based deduplication.
 *
 * @param {string} type — one of AlertTypes
 * @param {string} severity — 'low' | 'medium' | 'high' | 'critical'
 * @param {Object} data — alert payload
 * @param {import('ioredis').Redis} redisClient — Redis instance for dedup
 * @returns {Promise<boolean>} — true if alert was emitted, false if deduped
 */
async function emitAlert(type, severity, data, redisClient) {
    try {
        if (!redisClient || typeof redisClient.get !== 'function') {
            return false;
        }

        // Dedup check: if key exists, skip
        const dedupKey = `alert:${type}`;
        const existing = await redisClient.get(dedupKey);
        if (existing) {
            return false;
        }

        // Set dedup key with TTL
        await redisClient.set(dedupKey, '1', 'EX', ALERT_DEDUP_TTL);

        // Emit via systemEventsQueue
        try {
            const { systemEventsQueue } = require('./queues');
            await systemEventsQueue.add(
                'SYSTEM_ALERT',
                createEnvelope('SYSTEM_ALERT', {
                    alertType: type,
                    severity,
                    data,
                    timestamp: new Date().toISOString(),
                }, Sources.WORKER)
            );
        } catch (queueErr) {
            // Queue emit failure is non-fatal — dedup key is already set
            try {
                const logger = require('../server/utils/logger');
                logger.error({ err: queueErr.message, alertType: type }, 'Alert queue emission failed');
            } catch (_) { /* never crash */ }
        }

        return true;
    } catch (err) {
        // Total failure — log and return false
        try {
            const logger = require('../server/utils/logger');
            logger.error({ err: err.message, alertType: type }, 'Alert emission failed');
        } catch (_) { /* never crash */ }
        return false;
    }
}

/**
 * Track payment failures in a rolling 5-minute window and trigger
 * PAYMENT_FAILURE_SPIKE alert when threshold is reached.
 *
 * @param {import('ioredis').Redis} redisClient — Redis instance
 * @param {number} [threshold=3] — number of failures to trigger alert
 * @returns {Promise<boolean>} — true if spike alert was triggered
 */
async function trackPaymentFailure(redisClient, threshold = 3) {
    try {
        if (!redisClient || typeof redisClient.get !== 'function') {
            return false;
        }

        // 5-minute window key
        const windowKey = Math.floor(Date.now() / 300000);
        const redisKey = `payment:failures:${windowKey}`;

        // Increment counter
        const currentRaw = await redisClient.get(redisKey);
        const current = parseInt(currentRaw || '0', 10) + 1;
        await redisClient.set(redisKey, current.toString(), 'EX', ALERT_DEDUP_TTL);

        // Check threshold
        if (current >= threshold) {
            return emitAlert(
                AlertTypes.PAYMENT_FAILURE_SPIKE,
                'critical',
                { failureCount: current, window: `${ALERT_DEDUP_TTL}s` },
                redisClient
            );
        }

        return false;
    } catch (err) {
        return false;
    }
}

module.exports = {
    emitAlert,
    trackPaymentFailure,
    AlertTypes,
    ALERT_DEDUP_TTL,
};
