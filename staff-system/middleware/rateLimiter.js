/**
 * rateLimiter.js — Tiered rate limiting for the Staff Operations Portal
 *
 * Three tiers:
 *  1. globalLimiter   — blanket guard on every request
 *  2. authLimiter     — strict limit on login / password-reset endpoints
 *  3. webhookLimiter  — M-Pesa callback guard (Safaricom sends bursts)
 */

const rateLimit = require('express-rate-limit');

// ── 1. Global Limiter ────────────────────────────────────────────────────────
// 200 requests per 10-minute window per IP.  Keeps the server breathing.
const globalLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again later.', statusCode: 429 }
    },
    // Skip rate limiting in test environment
    skip: () => process.env.NODE_ENV === 'test'
});

// ── 2. Auth Limiter ──────────────────────────────────────────────────────────
// 10 login attempts per minute per IP — brute-force protection.
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: { code: 'AUTH_RATE_LIMIT', message: 'Too many login attempts. Wait 60 seconds.', statusCode: 429 }
    },
    skip: () => process.env.NODE_ENV === 'test'
});

// ── 3. Webhook Limiter ───────────────────────────────────────────────────────
// 60 requests per minute — Safaricom sends callbacks in bursts but never
// this fast for a single deployment.
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: { code: 'WEBHOOK_RATE_LIMIT', message: 'Too many webhook requests.', statusCode: 429 }
    },
    skip: () => process.env.NODE_ENV === 'test'
});

module.exports = { globalLimiter, authLimiter, webhookLimiter };
