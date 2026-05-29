/**
 * logger/requestLogger.js — Structured HTTP request logging middleware
 *
 * Phase 4: Replaces the minimal pino-http wrapper with a custom middleware
 * that captures duration, userId, and correlationId while skipping
 * health-check endpoints.
 *
 * Usage:
 *   const { requestLogger } = require('./logger/requestLogger');
 *   app.use(requestLogger);
 */

const crypto = require('crypto');
const logger = require('../server/utils/logger');

/** Paths to skip logging for (health checks, probes) */
const SKIP_PATHS = new Set([
    '/health',
    '/health/live',
    '/health/ready',
    '/health/deep',
    '/ping',
]);

/**
 * Express middleware that logs every HTTP request with structured fields.
 */
function requestLogger(req, res, next) {
    // Skip health check endpoints
    if (SKIP_PATHS.has(req.path)) {
        return next();
    }

    // Correlation ID: use existing header or generate
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    res.setHeader('x-correlation-id', correlationId);
    res.locals.correlationId = correlationId;

    const startTime = process.hrtime.bigint();

    // Capture the original end method
    const originalEnd = res.end;
    res.end = function (...args) {
        res.end = originalEnd;
        res.end(...args);

        try {
            const durationNs = process.hrtime.bigint() - startTime;
            const durationMs = Number(durationNs / 1_000_000n);

            const userId = req.user?._id || req.admin?.adminId || req.admin?._id || undefined;

            const logData = {
                method: req.method,
                path: req.originalUrl || req.url,
                status: res.statusCode,
                duration: durationMs,
                ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip,
                correlationId,
            };

            if (userId) {
                logData.userId = userId.toString();
            }

            if (res.statusCode >= 500) {
                logger.error(logData, 'HTTP request');
            } else if (res.statusCode >= 400) {
                logger.warn(logData, 'HTTP request');
            } else {
                logger.info(logData, 'HTTP request');
            }
        } catch (_) {
            // Never crash the application due to logging
        }
    };

    next();
}

module.exports = requestLogger;
module.exports.requestLogger = requestLogger;
