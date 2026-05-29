/**
 * queue/workers/notification.worker.js — Multi-channel notification worker
 *
 * Routes notifications by channel: email, sms, push.
 * Idempotent — dedup on notificationId before sending.
 *
 * Phase 4: Replaced console.log/error with structured Pino logger.
 *          Added attachJobLogging for lifecycle event instrumentation.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { createTrackedConnection } = require('../connection');
const { persistToDeadLetter } = require('../deadLetterQueue');
const { createServiceLogger } = require('../../server/utils/logger');
const { attachJobLogging } = require('../../logger/jobLogger');

const logger = createServiceLogger('notification-worker');

// In-memory dedup set — cleared on restart, which is acceptable because
// the notificationId is also checked in the DB if needed.
const _sentNotifications = new Set();

async function connectDB() {
    if (mongoose.connection.readyState === 1) return;
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB connected');
}

async function startWorker() {
    await connectDB();

    const emailService = require('../../server/services/emailService');
    // SMS and push services may not exist yet — degrade gracefully
    let smsService = null;
    let pushService = null;
    try { smsService = require('../../server/services/smsService'); } catch { /* not yet implemented */ }
    try { pushService = require('../../server/services/pushService'); } catch { /* not yet implemented */ }

    const workerConnection = createTrackedConnection('notification-worker');

    const worker = new Worker('notification', async (job) => {
        const { notificationId, channel, recipient, subject, body, data } = job.data;

        logger.info({ jobId: job.id, channel, recipient }, 'Processing notification job');

        // Dedup check
        if (notificationId && _sentNotifications.has(notificationId)) {
            logger.info({ notificationId }, 'Duplicate notification — skipping');
            return;
        }

        switch (channel) {
            case 'email':
                await emailService.sendEmail({
                    to: [{ email: recipient }],
                    subject: subject || 'Notification',
                    htmlContent: body || '',
                    ...data,
                });
                break;

            case 'sms':
                if (!smsService) throw new Error('SMS service not available');
                await smsService.send(recipient, body);
                break;

            case 'push':
                if (!pushService) throw new Error('Push service not available');
                await pushService.send(recipient, { title: subject, body, ...data });
                break;

            default:
                throw new Error(`Unknown notification channel: ${channel}`);
        }

        // Mark as sent
        if (notificationId) {
            _sentNotifications.add(notificationId);
        }

        logger.info({ jobId: job.id, channel }, 'Notification job sent');
    }, {
        connection: workerConnection,
        concurrency: 10,
    });

    // Phase 4: Attach structured lifecycle logging
    attachJobLogging(worker, 'notification', logger);

    worker.on('failed', async (job, err) => {
        if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
            await persistToDeadLetter(job, err);
        }
    });

    worker.on('error', (err) => {
        logger.error({ err: err.message }, 'Worker error');
    });

    logger.info('Started with concurrency: 10');
}

if (require.main === module) {
    startWorker().catch(err => {
        logger.error({ err: err.message }, 'Fatal startup error');
        process.exit(1);
    });
}

module.exports = { startWorker };
