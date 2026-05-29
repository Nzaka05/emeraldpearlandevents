/**
 * server/middleware/auditLog.js — Async fire-and-forget audit logging
 *
 * Phase 4: Creates audit entries without blocking the request path.
 * On failure, errors are logged but NEVER thrown.
 *
 * Usage:
 *   const { createAuditLog } = require('./server/middleware/auditLog');
 *   createAuditLog('auth', 'LOGIN_SUCCESS', req, { metadata: { provider: 'local' } });
 */

const SystemAuditLog = require('../models/SystemAuditLog');
const logger = require('../utils/logger');

/**
 * Persist an audit event to MongoDB. Fire-and-forget.
 *
 * @param {string} category — 'auth' | 'financial' | 'admin' | 'security'
 * @param {string} action — event name (e.g. 'LOGIN_SUCCESS', 'PAYMENT_PROCESSED')
 * @param {import('express').Request|null} req — Express request (null for worker contexts)
 * @param {Object} [options={}]
 * @param {import('mongoose').Types.ObjectId} [options.userId] — override auto-detected user
 * @param {import('mongoose').Types.ObjectId} [options.targetId] — related entity ID
 * @param {string} [options.targetModel] — related entity model name
 * @param {Object} [options.metadata] — additional context
 * @param {string} [options.severity] — 'low' | 'medium' | 'high' | 'critical'
 * @param {string} [options.correlationId] — override auto-detected correlation ID
 * @param {string} [options.ip] — override auto-detected IP
 * @param {string} [options.userAgent] — override auto-detected user agent
 */
function createAuditLog(category, action, req, options = {}) {
    try {
        const userId = options.userId
            || req?.user?._id
            || req?.admin?.adminId
            || req?.admin?._id
            || undefined;

        const ip = options.ip
            || req?.headers?.['x-forwarded-for']
            || req?.connection?.remoteAddress
            || req?.ip
            || undefined;

        const userAgent = options.userAgent
            || req?.headers?.['user-agent']
            || undefined;

        const correlationId = options.correlationId
            || req?.res?.locals?.correlationId
            || undefined;

        const doc = {
            timestamp: new Date(),
            category,
            action,
            userId,
            targetId: options.targetId || undefined,
            targetModel: options.targetModel || undefined,
            metadata: options.metadata || undefined,
            ip,
            userAgent,
            severity: options.severity || 'low',
            correlationId,
        };

        // Fire-and-forget — do NOT await in the request path
        SystemAuditLog.create(doc).catch((err) => {
            logger.error(
                { err: err.message, category, action },
                'Audit log persistence failed (non-fatal)'
            );
        });
    } catch (err) {
        // Outer catch: if building the doc itself fails, log and swallow
        try {
            logger.error(
                { err: err.message, category, action },
                'Audit log creation failed (non-fatal)'
            );
        } catch (_) {
            // Absolute last resort — never crash
        }
    }
}

module.exports = { createAuditLog };
