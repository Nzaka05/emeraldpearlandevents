/**
 * queue/deadLetterQueue.js — DLQ persistence and alerting
 *
 * SAFETY: Payload stored is REFERENCE ONLY — { idempotencyKey, bookingRef }.
 * Raw M-Pesa callbacks, originalPayload, and sensitive data are NEVER stored in the DLQ.
 * Worker re-queries MongoDB for full payload on retry.
 */

const DeadLetterJob = require('./models/DeadLetterJob');
const { systemEventsQueue } = require('./queues');
const { EventTypes, createEnvelope, Sources } = require('./events');

/**
 * Persist a failed job to the dead letter collection and alert admins.
 *
 * @param {import('bullmq').Job} job — the failed BullMQ job
 * @param {Error|string} error — the error that caused the final failure
 */
async function persistToDeadLetter(job, error) {
    const errorMessage = typeof error === 'string' ? error : (error?.message || 'Unknown error');
    const queueName = job.queueName || 'unknown';

    try {
        // Store reference payload only — never raw M-Pesa or full originalPayload
        await DeadLetterJob.create({
            queueName,
            jobId: job.id,
            jobName: job.name,
            payload: {
                idempotencyKey: job.data?.idempotencyKey || null,
                bookingRef: job.data?.bookingRef || null,
            },
            error: errorMessage,
            failedAt: new Date(),
            attempts: job.attemptsMade || 0,
            originalTimestamp: job.data?.metadata?.timestamp || new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        console.error(
            `[DLQ] ⚠️  Job ${job.id} from queue "${queueName}" moved to dead letter after ${job.attemptsMade} attempts: ${errorMessage}`
        );

        // Publish DLQ_INSERTION event for admin Socket.io alert
        try {
            await systemEventsQueue.add(
                EventTypes.DLQ_INSERTION,
                createEnvelope(EventTypes.DLQ_INSERTION, {
                    queueName,
                    jobId: job.id,
                    jobName: job.name,
                    error: errorMessage,
                    bookingRef: job.data?.bookingRef || null,
                }, Sources.WORKER)
            );
        } catch (eventErr) {
            // Alert failure is non-fatal — the DLQ entry is already persisted
            console.error('[DLQ] Failed to publish DLQ_INSERTION event:', eventErr.message);
        }
    } catch (persistErr) {
        // Last resort: if even the DLQ save fails, log everything to stdout
        // so ops can recover from logs
        console.error('[DLQ] CRITICAL: Failed to persist dead letter job:', persistErr.message);
        console.error('[DLQ] Job data:', JSON.stringify({
            jobId: job.id,
            queueName,
            bookingRef: job.data?.bookingRef,
            idempotencyKey: job.data?.idempotencyKey,
            error: errorMessage,
        }));
    }
}

module.exports = { persistToDeadLetter };
