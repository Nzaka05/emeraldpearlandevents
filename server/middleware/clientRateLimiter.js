const rateLimit = require('express-rate-limit');

exports.loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5,
    message: { success: false, error: 'Too many login attempts, please try again after a minute' },
    standardHeaders: true,
    legacyHeaders: false
});

exports.passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    message: { success: false, error: 'Too many password reset requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

exports.generalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: { success: false, error: 'Rate limit exceeded for API endpoints' },
    standardHeaders: true,
    legacyHeaders: false
});
