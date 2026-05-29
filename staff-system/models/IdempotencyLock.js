/**
 * IdempotencyLock.js — DB-based distributed lock for M-Pesa callbacks
 *
 * HOW IT WORKS:
 *   1. Caller tries to INSERT a document with a unique `key`
 *   2. If insert succeeds → caller holds the lock (status: 'processing')
 *   3. If E11000 DuplicateKeyError → lock already exists:
 *      - status 'completed' → return cached result (duplicate callback)
 *      - status 'processing' → another process is handling it (return early)
 *      - status 'failed'     → eligible for retry by recovery service
 *   4. After processing, caller updates lock to 'completed' + caches result
 *   5. TTL index auto-deletes locks after 48 hours
 *
 * WHY NOT REDIS:
 *   Adding Redis for a single use case adds operational overhead. MongoDB's
 *   unique index provides the same atomicity guarantee for lock acquisition.
 *   The E11000 error code is deterministic and cannot produce false negatives.
 *
 * STALE LOCK DETECTION:
 *   If a process crashes while holding a lock (status: 'processing'), the
 *   recovery service detects locks older than STALE_THRESHOLD_MS and marks
 *   them as 'failed' for retry.
 */

const mongoose = require('mongoose');

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TTL_SECONDS = 48 * 60 * 60; // 48 hours

const IdempotencyLockSchema = new mongoose.Schema({
    // The idempotency key — must be globally unique.
    // Format: "mpesa:b2c:{TransactionID}:{ResultCode}:{AssignmentID}:{StaffPaymentID}"
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Lock lifecycle state
    status: {
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing',
        required: true
    },

    // Cached result — returned to duplicate callers
    result: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    // Error details for failed locks (used by recovery service)
    errorMessage: {
        type: String,
        default: ''
    },

    // How many times the recovery service has retried this lock
    retryCount: {
        type: Number,
        default: 0
    },

    // Maximum retries before permanent failure
    maxRetries: {
        type: Number,
        default: 3
    },

    // Original callback payload — stored for retry
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    // When the lock was acquired
    lockedAt: {
        type: Date,
        default: Date.now
    },

    // When processing completed (success or permanent failure)
    completedAt: {
        type: Date,
        default: null
    },

    // TTL — MongoDB auto-deletes this document after expiry
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000),
        index: { expires: 0 }   // TTL index
    }
});

// ── STATIC METHODS ───────────────────────────────────────────────────────────

/**
 * Try to acquire a lock. Returns { acquired, lock }.
 *
 * If acquired === true  → caller must process the callback, then call completeLock() or failLock().
 * If acquired === false → lock.status tells the caller what happened:
 *   - 'completed'  → duplicate callback, lock.result has the cached response
 *   - 'processing' → another process is handling it right now
 *   - 'failed'     → previous attempt failed (recovery service will retry)
 */
IdempotencyLockSchema.statics.tryAcquire = async function (key, payload) {
    try {
        const lock = await this.create({
            key,
            status: 'processing',
            payload,
            lockedAt: new Date()
        });
        return { acquired: true, lock };
    } catch (err) {
        if (err.code === 11000) {
            // Lock already exists — read its current state
            const existing = await this.findOne({ key }).lean();
            return { acquired: false, lock: existing };
        }
        throw err; // Unexpected error — let it bubble
    }
};

/**
 * Mark a lock as successfully completed with a cached result.
 */
IdempotencyLockSchema.statics.completeLock = async function (key, result) {
    return this.findOneAndUpdate(
        { key },
        {
            status: 'completed',
            result,
            completedAt: new Date(),
            errorMessage: ''
        },
        { new: true }
    );
};

/**
 * Mark a lock as failed (eligible for retry by recovery service).
 */
IdempotencyLockSchema.statics.failLock = async function (key, errorMessage) {
    return this.findOneAndUpdate(
        { key },
        {
            status: 'failed',
            errorMessage,
            completedAt: new Date()
        },
        { new: true }
    );
};

/**
 * Find stale "processing" locks (process crashed before completing).
 */
IdempotencyLockSchema.statics.findStaleLocks = async function () {
    const threshold = new Date(Date.now() - STALE_THRESHOLD_MS);
    return this.find({
        status: 'processing',
        lockedAt: { $lt: threshold }
    });
};

/**
 * Find failed locks eligible for retry.
 */
IdempotencyLockSchema.statics.findRetryable = async function () {
    return this.find({
        status: 'failed',
        $expr: { $lt: ['$retryCount', '$maxRetries'] }
    });
};

/**
 * Claim a failed lock for retry (atomically set status back to 'processing'
 * and increment retryCount). Returns null if another process claimed it first.
 */
IdempotencyLockSchema.statics.claimForRetry = async function (key) {
    return this.findOneAndUpdate(
        {
            key,
            status: 'failed',
            $expr: { $lt: ['$retryCount', '$maxRetries'] }
        },
        {
            status: 'processing',
            lockedAt: new Date(),
            $inc: { retryCount: 1 }
        },
        { new: true }
    );
};

module.exports = mongoose.models.IdempotencyLock || mongoose.model('IdempotencyLock', IdempotencyLockSchema);
