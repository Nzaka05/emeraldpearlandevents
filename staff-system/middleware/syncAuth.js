/**
 * syncAuth.js — HMAC-SHA256 signature verification for internal sync routes
 *
 * Protocol:
 *   Sender sets these headers:
 *     x-sync-timestamp  — Unix epoch ms when the request was created
 *     x-sync-signature  — HMAC-SHA256(secret, timestamp + "." + JSON.stringify(body))
 *
 *   Receiver verifies:
 *     1. Timestamp is within ±30 seconds (prevents replay)
 *     2. Signature matches recomputed HMAC (prevents tampering)
 *
 * Phase 3: Legacy x-sync-secret fallback has been REMOVED.
 *          All callers must use createSyncHeaders() for HMAC-signed requests.
 */

const crypto = require('crypto');

const CLOCK_DRIFT_MS = 30_000; // 30 seconds

/**
 * Generate headers for an outbound sync request.
 * Call this on the SENDING side (Port 3000 → 3001 or vice versa).
 *
 * @param {string} secret  — SYNC_SECRET from env
 * @param {object} body    — the JSON body being sent
 * @returns {{ 'x-sync-timestamp': string, 'x-sync-signature': string, 'Content-Type': string }}
 */
function createSyncHeaders(secret, body) {
    const timestamp = Date.now().toString();
    const payload = timestamp + '.' + JSON.stringify(body);
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return {
        'Content-Type': 'application/json',
        'x-sync-timestamp': timestamp,
        'x-sync-signature': signature
    };
}

/**
 * Express middleware — verifies inbound sync requests.
 * HMAC signature is the SOLE authentication mechanism (Phase 3).
 */
function verifySyncAuth(req, res, next) {
    const secret = process.env.SYNC_SECRET;
    if (!secret) {
        console.error('[SyncAuth] FATAL: SYNC_SECRET not configured');
        return res.status(500).json({ error: 'Internal configuration error' });
    }

    const timestamp = req.headers['x-sync-timestamp'];
    const signature = req.headers['x-sync-signature'];

    // HMAC signature is required — no fallback
    if (!timestamp || !signature) {
        console.warn('[SyncAuth] Rejected: HMAC signature required');
        return res.status(401).json({ error: 'Unauthorized: HMAC signature required' });
    }

    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);

    // Reject if timestamp is not a valid number or outside the drift window
    if (isNaN(requestTime) || Math.abs(now - requestTime) > CLOCK_DRIFT_MS) {
        console.warn(`[SyncAuth] Rejected: timestamp drift ${Math.abs(now - requestTime)}ms`);
        return res.status(401).json({ error: 'Request expired or clock skew too large' });
    }

    // Recompute the expected signature
    const payload = timestamp + '.' + JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
        console.warn('[SyncAuth] Rejected: signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    return next();
}

module.exports = { verifySyncAuth, createSyncHeaders };
