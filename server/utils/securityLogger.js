const SecurityEvent = require('../models/SecurityEvent');
const logger = require('./logger');

async function logSecurityEvent(eventType, data = {}) {
    try {
        await SecurityEvent.create({
            eventType,
            userId: data.userId || null,
            userEmail: data.userEmail || '',
            ipAddress: data.ipAddress || null,
            userAgent: data.userAgent || null,
            metadata: data.metadata || null
        }).catch(err => {
            logger.error({ err }, 'Failed to log security event (non-blocking)');
        });
    } catch (err) {
        logger.error({ err }, 'Security event logging error (non-blocking)');
    }
}

module.exports = { logSecurityEvent };
