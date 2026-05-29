/**
 * queue/workers/payment.worker.js — Payment processing worker
 *
 * STATELESS — no shared in-memory state between instances.
 * Horizontally scalable via PM2 instances: 2.
 *
 * Processing steps (in order):
 *   1. Acquire idempotency lock
 *   2. Assert payment state machine transition
 *   3. Record ledger transaction
 *   4. Complete lock
 *   5. Publish PAYMENT_COMPLETED to systemEventsQueue
 *
 * On ANY error: fail the lock and rethrow so BullMQ handles retry.
 * After max retries: BullMQ's 'failed' event triggers DLQ persistence.
 *
 * Phase 4: Replaced console.log/error with structured Pino logger.
 *          Added attachJobLogging for lifecycle event instrumentation.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { createTrackedConnection } = require('../connection');
const { systemEventsQueue } = require('../queues');
const { persistToDeadLetter } = require('../deadLetterQueue');
const { EventTypes, createEnvelope, Sources } = require('../events');
const { createServiceLogger } = require('../../server/utils/logger');
const { attachJobLogging } = require('../../logger/jobLogger');

const logger = createServiceLogger('payment-worker');

// ── MongoDB Connection ───────────────────────────────────────────────────────
async function connectDB() {
    if (mongoose.connection.readyState === 1) return;
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB connected');
}

// ── Worker Setup ─────────────────────────────────────────────────────────────

async function startWorker() {
    await connectDB();

    // Lazy-load after DB is connected so models register correctly
    const IdempotencyLock = require('../../staff-system/models/IdempotencyLock');
    const paymentStateMachine = require('../../staff-system/financials/utils/paymentStateMachine');
    const ledgerService = require('../../staff-system/financials/services/ledgerService');

    const workerConnection = createTrackedConnection('payment-worker');

    const worker = new Worker('payment', async (job) => {
        const { bookingRef, amount, currency, paymentMethod, idempotencyKey, retryCount } = job.data;

        logger.info({ jobId: job.id, bookingRef, attempt: job.attemptsMade + 1 }, 'Processing payment job');

        // Step 1: Acquire idempotency lock
        const lockAcquired = await IdempotencyLock.tryAcquire(idempotencyKey, {
            bookingRef,
            amount,
        });

        if (!lockAcquired) {
            logger.info({ idempotencyKey }, 'Lock not acquired — already processing');
            return; // Another worker/process owns this — safe to skip
        }

        try {
            // Step 2: Assert state machine transition
            // Query current payment status from DB
            const Booking = require('../../server/models/Booking');
            const booking = await Booking.findOne({ bookingReference: bookingRef });
            const currentStatus = booking?.paymentStatus || 'Pending';

            paymentStateMachine.assertTransition(currentStatus, 'Sent');

            // Step 3: Record ledger transaction
            await ledgerService.recordTransaction({
                bookingRef,
                amount,
                currency: currency || 'KES',
                paymentMethod: paymentMethod || 'MPesa',
                type: 'credit',
                description: `Payment processed for ${bookingRef}`,
            });

            // Step 4: Complete the lock
            await IdempotencyLock.completeLock(idempotencyKey);

            // Step 5: Publish completion event for Socket.io bridge
            const transactionId = `TXN-${Date.now()}-${bookingRef}`;
            await systemEventsQueue.add(
                EventTypes.PAYMENT_COMPLETED,
                createEnvelope(EventTypes.PAYMENT_COMPLETED, {
                    bookingRef,
                    amount,
                    currency: currency || 'KES',
                    transactionId,
                    clientRoom: `client:${bookingRef}`,
                }, Sources.WORKER)
            );

            logger.info({ jobId: job.id, bookingRef, transactionId }, 'Payment job completed');
        } catch (err) {
            // On ANY error: fail the lock so it can be retried
            try {
                await IdempotencyLock.failLock(idempotencyKey);
            } catch (lockErr) {
                logger.error({ idempotencyKey, err: lockErr.message }, 'Failed to release lock');
            }

            // Publish failure event
            try {
                await systemEventsQueue.add(
                    EventTypes.PAYMENT_FAILED,
                    createEnvelope(EventTypes.PAYMENT_FAILED, {
                        bookingRef,
                        error: err.message,
                        clientRoom: `client:${bookingRef}`,
                    }, Sources.WORKER)
                );
            } catch (_) { /* non-fatal */ }

            // Rethrow so BullMQ handles retry/backoff
            throw err;
        }
    }, {
        connection: workerConnection,
        concurrency: 5,
    });

    // Phase 4: Attach structured lifecycle logging
    attachJobLogging(worker, 'payment', logger);

    // ── DLQ Handler: triggered when all retries are exhausted ─────────────────
    worker.on('failed', async (job, err) => {
        if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
            await persistToDeadLetter(job, err);
        }
    });

    worker.on('error', (err) => {
        logger.error({ err: err.message }, 'Worker error');
    });

    logger.info('Started with concurrency: 5');
}

// Start when executed directly
if (require.main === module) {
    startWorker().catch(err => {
        logger.error({ err: err.message }, 'Fatal startup error');
        process.exit(1);
    });
}

module.exports = { startWorker };
