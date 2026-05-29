/**
 * logger/jobLogger.js — BullMQ worker event logging hooks
 *
 * Phase 4: Attaches structured logging to BullMQ worker lifecycle events
 * (active, completed, failed) without modifying any business logic.
 *
 * Usage:
 *   const { attachJobLogging } = require('./logger/jobLogger');
 *   attachJobLogging(worker, 'payment', logger);
 */

/**
 * Attach structured logging hooks to a BullMQ worker instance.
 *
 * @param {import('bullmq').Worker} worker — BullMQ worker instance
 * @param {string} queueName — human-readable queue name for log context
 * @param {import('pino').Logger} logger — Pino logger instance
 */
function attachJobLogging(worker, queueName, logger) {
    if (!worker || !logger) return;

    worker.on('active', (job) => {
        try {
            const correlationId = job?.data?.metadata?.correlationId || undefined;
            logger.info({
                queueName,
                jobId: job?.id,
                jobName: job?.name,
                correlationId,
            }, 'Job started');
        } catch (_) { /* never throw from logging */ }
    });

    worker.on('completed', (job) => {
        try {
            const correlationId = job?.data?.metadata?.correlationId || undefined;
            const duration = (job?.finishedOn && job?.processedOn)
                ? job.finishedOn - job.processedOn
                : undefined;
            logger.info({
                queueName,
                jobId: job?.id,
                jobName: job?.name,
                duration,
                attemptsMade: job?.attemptsMade,
                correlationId,
            }, 'Job completed');
        } catch (_) { /* never throw from logging */ }
    });

    worker.on('failed', (job, err) => {
        try {
            const correlationId = job?.data?.metadata?.correlationId || undefined;
            logger.error({
                queueName,
                jobId: job?.id,
                jobName: job?.name,
                error: err?.message || 'Unknown error',
                attemptsMade: job?.attemptsMade,
                correlationId,
            }, 'Job failed');
        } catch (_) { /* never throw from logging */ }
    });
}

module.exports = { attachJobLogging };
