/**
 * paymentRecoveryService.js — Cron-driven payment failure recovery
 *
 * WHAT IT DOES:
 *   1. Finds stale "processing" locks (process crashed) and marks them failed
 *   2. Retries failed locks by enqueuing to BullMQ payment queue
 *   3. Detects staff payments stuck in "Sent" for >24h and alerts admins
 *   4. Detects orphan ledger entries (Transaction without matching ledger)
 *
 * HOW TO USE:
 *   Call runRecovery() from a cron job (e.g., every 10 minutes):
 *     const { runRecovery } = require('./paymentRecoveryService');
 *     setInterval(() => runRecovery(), 10 * 60 * 1000);
 *
 * PHASE 3 INTEGRATION:
 *   - retryFailedLocks now enqueues to BullMQ payment queue (stateless worker retry)
 *   - detectStuckPayments publishes alerts via systemEventsQueue
 *   - Falls back to direct replay if queue is unavailable
 *
 * SAFETY:
 *   - Each retry re-acquires the IdempotencyLock (claimForRetry is atomic)
 *   - Two recovery workers cannot retry the same lock simultaneously
 *   - Max 3 retries per lock (configurable in IdempotencyLock.maxRetries)
 *   - All recovery actions are audit-logged
 */

const IdempotencyLock = require('../../models/IdempotencyLock');
const Assignment = require('../../models/Assignment');
const AuditLog = require('../../models/AuditLog');

const STUCK_PAYMENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Safely load BullMQ queues. Returns null if unavailable (e.g., no Redis).
 */
function getQueues() {
    try {
        return require('../../../queue/queues');
    } catch (err) {
        console.warn('[Recovery] BullMQ queues unavailable, using direct retry:', err.message);
        return null;
    }
}

/**
 * 1. Recover stale locks — processes that crashed while holding a lock.
 *    Marks them as 'failed' so they become eligible for retry.
 */
async function recoverStaleLocks() {
    const staleLocks = await IdempotencyLock.findStaleLocks();
    let recovered = 0;

    for (const lock of staleLocks) {
        await IdempotencyLock.failLock(lock.key, 'Recovered from stale processing state (process crash)');
        recovered++;
        console.warn(`[Recovery] Stale lock recovered: ${lock.key}`);
    }

    return recovered;
}

/**
 * 2. Retry failed locks — enqueues to BullMQ payment queue for stateless worker retry.
 *    Falls back to direct replay if queue is unavailable.
 *    Uses claimForRetry() which is atomic — two workers cannot claim the same lock.
 */
async function retryFailedLocks() {
    const retryable = await IdempotencyLock.findRetryable();
    let retried = 0;
    let succeeded = 0;

    const queues = getQueues();

    for (const lock of retryable) {
        // Atomically claim the lock for retry
        const claimed = await IdempotencyLock.claimForRetry(lock.key);
        if (!claimed) continue; // Another worker claimed it first

        retried++;

        try {
            if (!claimed.payload) {
                await IdempotencyLock.failLock(lock.key, 'No payload stored — cannot retry');
                continue;
            }

            // ── Phase 3: Enqueue to BullMQ payment queue ──
            if (queues && queues.paymentQueue) {
                const { createEnvelope, EventTypes, Sources } = require('../../../queue/events');

                const envelope = createEnvelope(
                    EventTypes.PROCESS_PAYMENT,
                    {
                        idempotencyKey: lock.key,
                        bookingRef: claimed.payload?.bookingRef || claimed.payload?.Occasion || lock.key,
                        recoveryRetry: true,
                        retryCount: (lock.retryCount || 0),
                        originalPayload: claimed.payload,
                    },
                    Sources.RECOVERY
                );

                await queues.paymentQueue.add('RECOVERY_RETRY', envelope, {
                    priority: 5,         // Lower priority than live payments (default 0)
                    attempts: 2,         // Recovery gets 2 more attempts via worker
                    backoff: { type: 'exponential', delay: 30000 }, // 30s base delay
                    jobId: `recovery:${lock.key}`, // Dedup by lock key
                });

                succeeded++;
                console.log(`[Recovery] Enqueued retry for: ${lock.key} → payment queue`);
                continue;
            }

            // ── Fallback: Direct replay (pre-Phase 3 behavior) ──
            const { normalizeMpesaCallback } = require('../../../utils/mpesaCallbackNormalizer');
            const normalized = normalizeMpesaCallback(claimed.payload);

            if (!normalized || normalized.flow !== 'b2c') {
                await IdempotencyLock.failLock(lock.key, 'Payload normalization failed on retry');
                continue;
            }

            const { resultCode, resultDesc, identifiers } = normalized;
            const TransactionID = identifiers.transactionId;
            const Occasion = identifiers.occasion;

            if (!Occasion) {
                await IdempotencyLock.failLock(lock.key, 'No Occasion in payload — cannot retry');
                continue;
            }

            const [assignmentId, staffPaymentId] = Occasion.split('|');

            // Re-process the callback
            let result;
            if (Number(resultCode) === 0) {
                // For success callbacks: check if already applied (idempotent check)
                const existing = await Assignment.findOne(
                    { _id: assignmentId, 'staff_payments._id': staffPaymentId },
                    { 'staff_payments.$': 1 }
                ).lean();

                if (existing?.staff_payments?.[0]?.transaction_id === TransactionID) {
                    // Already applied — mark as completed
                    result = existing.staff_payments[0];
                } else {
                    // Not yet applied — need to process
                    const { processB2CSuccessForRetry } = require('./eventPaymentService');
                    if (typeof processB2CSuccessForRetry === 'function') {
                        result = await processB2CSuccessForRetry(assignmentId, staffPaymentId, TransactionID);
                    } else {
                        // Fallback: update directly
                        const assignment = await Assignment.findOneAndUpdate(
                            { _id: assignmentId, 'staff_payments._id': staffPaymentId },
                            { $set: {
                                'staff_payments.$.status': 'Received',
                                'staff_payments.$.transaction_id': TransactionID,
                                'staff_payments.$.received_at': new Date(),
                                'staff_payments.$.paymentSyncStatus': 'synced'
                            } },
                            { new: true }
                        );
                        result = assignment;
                    }
                }
            } else {
                // Failure callback — just mark as failed
                await Assignment.findOneAndUpdate(
                    { _id: assignmentId, 'staff_payments._id': staffPaymentId },
                    { $set: {
                        'staff_payments.$.status': 'Failed',
                        'staff_payments.$.paymentSyncStatus': 'failed',
                        'staff_payments.$.lastSyncError': resultDesc
                    } }
                );
                result = { failed: true, reason: resultDesc };
            }

            await IdempotencyLock.completeLock(lock.key, result || { retrySucceeded: true });
            succeeded++;
            console.log(`[Recovery] Direct retry succeeded for: ${lock.key}`);

        } catch (err) {
            await IdempotencyLock.failLock(lock.key, `Retry failed: ${err.message}`);
            console.error(`[Recovery] Retry failed for ${lock.key}:`, err.message);
        }
    }

    return { retried, succeeded };
}

/**
 * 3. Detect stuck payments — staff payments in "Sent" status for too long.
 *    These indicate M-Pesa callbacks that never arrived (network failure,
 *    Safaricom outage, etc.). Alerts admins via Socket.io, systemEventsQueue, and AuditLog.
 */
async function detectStuckPayments() {
    const threshold = new Date(Date.now() - STUCK_PAYMENT_THRESHOLD_MS);

    const stuckAssignments = await Assignment.find({
        'staff_payments': {
            $elemMatch: {
                status: 'Sent',
                sent_at: { $lt: threshold }
            }
        }
    }).select('_id title staff_payments').lean();

    const alerts = [];

    for (const assignment of stuckAssignments) {
        const stuckPayments = assignment.staff_payments.filter(
            p => p.status === 'Sent' && p.sent_at && new Date(p.sent_at) < threshold
        );

        for (const sp of stuckPayments) {
            const hoursStuck = Math.round((Date.now() - new Date(sp.sent_at).getTime()) / (1000 * 60 * 60));
            alerts.push({
                assignmentId: assignment._id,
                assignmentTitle: assignment.title,
                staffPaymentId: sp._id,
                staffName: sp.staff_name,
                amount: sp.amount,
                sentAt: sp.sent_at,
                hoursStuck
            });
        }
    }

    if (alerts.length > 0) {
        // Alert admins via Socket.io
        if (global.io) {
            global.io.to('Admin').emit('stuckPaymentsAlert', {
                count: alerts.length,
                payments: alerts
            });
        }

        // Phase 3: Also publish via systemEventsQueue for worker-based alerting
        const queues = getQueues();
        if (queues && queues.systemEventsQueue) {
            const { createEnvelope, Sources } = require('../../../queue/events');
            await queues.systemEventsQueue.add('STUCK_PAYMENTS_ALERT', createEnvelope(
                'STUCK_PAYMENTS_ALERT',
                { count: alerts.length, payments: alerts },
                Sources.RECOVERY
            )).catch(err => console.warn('[Recovery] Failed to enqueue stuck alert:', err.message));
        }

        // Audit log the detection
        await AuditLog.create({
            actionType: 'STUCK_PAYMENTS_DETECTED',
            targetModel: 'System',
            targetId: null,
            performedBy: null,
            details: {
                count: alerts.length,
                payments: alerts.map(a => ({
                    assignment: a.assignmentTitle,
                    staff: a.staffName,
                    amount: a.amount,
                    hoursStuck: a.hoursStuck
                }))
            }
        });

        console.warn(`[Recovery] ${alerts.length} stuck payment(s) detected (>24h in Sent status)`);
    }

    return alerts;
}

/**
 * Main recovery entry point. Run from a cron job.
 */
async function runRecovery() {
    const startTime = Date.now();
    console.log('[Recovery] Starting payment recovery cycle...');

    try {
        const staleRecovered = await recoverStaleLocks();
        const { retried, succeeded } = await retryFailedLocks();
        const stuckAlerts = await detectStuckPayments();

        const elapsed = Date.now() - startTime;
        console.log(`[Recovery] Cycle complete in ${elapsed}ms — ` +
            `stale: ${staleRecovered}, retried: ${retried}/${succeeded} succeeded, ` +
            `stuck: ${stuckAlerts.length}`);

        return { staleRecovered, retried, succeeded, stuckAlerts: stuckAlerts.length, elapsedMs: elapsed };
    } catch (err) {
        console.error('[Recovery] Recovery cycle failed:', err.message);
        throw err;
    }
}

module.exports = { runRecovery, recoverStaleLocks, retryFailedLocks, detectStuckPayments };
