/**
 * server/utils/logger.js — Shared Pino logger with service-aware factory
 *
 * Phase 4: Extended to support per-service child loggers and correlationId
 * propagation across all 6 PM2 processes.
 *
 * Usage:
 *   const logger = require('./server/utils/logger');              // default (portal)
 *   const { createServiceLogger } = require('./server/utils/logger');
 *   const logger = createServiceLogger('payment-worker');
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

// Custom log levels — add 'http' between 'info' (30) and 'debug' (20)
const customLevels = {
    http: 25,
};

const loggerOptions = {
    level: process.env.LOG_LEVEL || 'info',
    customLevels,
    base: {
        service: 'portal',
        pid: process.pid,
        env: process.env.NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
};

if (!isProduction) {
    loggerOptions.transport = {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            singleLine: false,
            customLevels: 'http:25',
        },
    };
}

const logger = pino(loggerOptions);

/**
 * Create a child logger scoped to a specific service.
 *
 * @param {string} serviceName — one of: 'portal', 'staff-system',
 *   'payment-worker', 'notification-worker', 'email-worker'
 * @returns {import('pino').Logger}
 */
function createServiceLogger(serviceName) {
    return logger.child({ service: serviceName });
}

// Backward-compatible default export — existing `require('./server/utils/logger')`
// continues to work identically.
module.exports = logger;
module.exports.createServiceLogger = createServiceLogger;
