/**
 * queue/workers/systemEvents.worker.js — Socket.io bridge worker
 *
 * Runs INSIDE the server process (not a separate PM2 entry).
 * Concurrency: 2 (keep low — this runs in the HTTP server process).
 *
 * Routes system events to Socket.io rooms:
 *   PAYMENT_COMPLETED → io.to(clientRoom).emit('paymentProcessed', data)
 *   PAYMENT_FAILED    → io.to(clientRoom).emit('paymentFailed', data)
 *                        + tracks payment failure count for spike detection
 *   DLQ_INSERTION     → io.to('Admin').emit('deadLetterAlert', data)
 *   SYSTEM_ALERT      → io.to('Admin').emit('systemAlert', data)
 *
 * Phase 4: Added SYSTEM_ALERT routing and PAYMENT_FAILED spike tracking.
 */

const { Worker } = require('bullmq');
const { createTrackedConnection } = require('../connection');
const { EventTypes } = require('../events');
const { createServiceLogger } = require('../../server/utils/logger');

const logger = createServiceLogger('socket-bridge');

/**
 * Start the Socket.io bridge worker.
 * Called from server-prod.js after Socket.io is initialized.
 *
 * @param {import('socket.io').Server} io — the Socket.io server instance
 * @param {import('ioredis').Redis} [redisClient] — Redis for payment failure tracking
 * @returns {import('bullmq').Worker}
 */
function startSocketBridge(io, redisClient) {
    if (!io) {
        logger.error('Cannot start without io instance');
        return null;
    }

    const workerConnection = createTrackedConnection('system-events-worker');

    const worker = new Worker('systemEvents', async (job) => {
        const { type, payload } = job.data;

        logger.info({ eventType: type, jobId: job.id }, 'Processing system event');

        switch (type) {
            case EventTypes.PAYMENT_COMPLETED: {
                const { clientRoom, ...data } = payload;
                if (clientRoom) {
                    io.to(clientRoom).emit('paymentProcessed', data);
                }
                break;
            }

            case EventTypes.PAYMENT_FAILED: {
                const { clientRoom, ...data } = payload;
                if (clientRoom) {
                    io.to(clientRoom).emit('paymentFailed', data);
                }

                // Phase 4: Track payment failure count for spike detection
                if (redisClient) {
                    try {
                        const { trackPaymentFailure } = require('../alerting');
                        await trackPaymentFailure(redisClient);
                    } catch (err) {
                        logger.warn({ err: err.message }, 'Payment failure tracking failed (non-fatal)');
                    }
                }
                break;
            }

            case EventTypes.DLQ_INSERTION: {
                io.to('Admin').emit('deadLetterAlert', payload);
                break;
            }

            // Phase 4: Route alert events to Admin dashboard
            case 'SYSTEM_ALERT': {
                const alertData = payload;
                io.to('Admin').emit('systemAlert', {
                    type: alertData.alertType,
                    severity: alertData.severity,
                    data: alertData.data,
                    timestamp: alertData.timestamp || new Date().toISOString(),
                });
                logger.warn({
                    alertType: alertData.alertType,
                    severity: alertData.severity,
                }, 'System alert emitted to Admin room');
                break;
            }

            default:
                logger.warn({ eventType: type }, 'Unknown event type');
        }
    }, {
        connection: workerConnection,
        concurrency: 2,
    });

    worker.on('error', (err) => {
        logger.error({ err: err.message }, 'Worker error');
    });

    logger.info('System events bridge started (concurrency: 2)');
    return worker;
}

module.exports = { startSocketBridge };
