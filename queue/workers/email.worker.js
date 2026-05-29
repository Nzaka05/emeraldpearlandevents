/**
 * queue/workers/email.worker.js — Dedicated email delivery worker
 *
 * Catches all errors — failed emails go to DLQ but NEVER crash the worker.
 * This is critical because email failures are not financial and should not
 * block the worker process from handling other jobs.
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

const logger = createServiceLogger('email-worker');

async function connectDB() {
    if (mongoose.connection.readyState === 1) return;
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB connected');
}

async function startWorker() {
    await connectDB();

    const emailService = require('../../server/services/emailService');
    const workerConnection = createTrackedConnection('email-worker');

    const worker = new Worker('email', async (job) => {
        const { to, subject, template, data, htmlContent } = job.data;

        logger.info({ jobId: job.id, subject: subject || template, to }, 'Processing email job');

        try {
            if (template) {
                // Template-based email
                await emailService.sendEmail({
                    to: Array.isArray(to) ? to : [{ email: to }],
                    subject: subject || 'Emerald Pearland Events',
                    template,
                    ...data,
                });
            } else {
                // Direct HTML email
                await emailService.sendEmail({
                    to: Array.isArray(to) ? to : [{ email: to }],
                    subject: subject || 'Emerald Pearland Events',
                    htmlContent: htmlContent || data?.htmlContent || '',
                });
            }

            logger.info({ jobId: job.id }, 'Email job delivered');
        } catch (err) {
            // Log the error but NEVER rethrow — email failures must not crash the worker
            logger.error({ jobId: job.id, err: err.message }, 'Email job failed');

            // Still persist to DLQ for visibility, but don't rethrow
            if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
                await persistToDeadLetter(job, err).catch(dlqErr => {
                    logger.error({ err: dlqErr.message }, 'DLQ persist failed');
                });
            }
            // Intentionally NOT rethrowing — email failures are non-critical
        }
    }, {
        connection: workerConnection,
        concurrency: 10,
    });

    // Phase 4: Attach structured lifecycle logging
    attachJobLogging(worker, 'email', logger);

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
