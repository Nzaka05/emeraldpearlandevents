/**
 * aiRateLimiter.js
 * Tiered rate limiting for AI endpoints.
 */

const rateLimit = require('express-rate-limit');

function keyGenerator(req) {
    return req.user && req.user._id ? req.user._id.toString() : req.ip;
}

const rateLimitResponse = (req, res) => {
    return res.status(429).json({
        success: false,
        error: 'Too many requests'
    });
};

/** POST /portal/ai/assistant — 10 req/min */
const aiAssistantLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator,
    handler: rateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false
});

/** POST /portal/ai/action/execute, /feedback — 5 req/min */
const aiActionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator,
    handler: rateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false
});

/** GET /portal/admin-staff/ai/* — 30 req/min */
const aiReadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator,
    handler: rateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false
});

/** GET /client/api/event-health/:eventId — 20 req/min */
const clientHealthLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => req.clientUser?._id?.toString() || req.ip,
    handler: rateLimitResponse,
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    aiAssistantLimiter,
    aiActionLimiter,
    aiReadLimiter,
    clientHealthLimiter
};
