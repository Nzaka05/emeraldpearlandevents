/**
 * tests/finance/idempotency-lock.test.js
 *
 * Verifies the IdempotencyLock model guarantees:
 *   1. First acquire succeeds, duplicates return cached lock
 *   2. E11000 duplicate key error is handled, not thrown
 *   3. completeLock/failLock update status correctly
 *   4. Stale lock detection (processing > threshold)
 *   5. Retryable lock detection (failed, retryCount < maxRetries)
 *   6. claimForRetry is atomic — only one caller can claim
 *   7. Concurrent tryAcquire calls produce exactly one winner
 *
 * ARCHITECTURE:
 *   IdempotencyLock uses MongoDB unique index on `key` for lock acquisition.
 *   The E11000 duplicate key error is deterministic — no false negatives.
 *   This eliminates the need for Redis-based distributed locks.
 */

const IdempotencyLock = require('../../staff-system/models/IdempotencyLock');

jest.setTimeout(30000);

describe('IdempotencyLock — lock acquisition', () => {
    it('first tryAcquire succeeds with acquired=true', async () => {
        const key = `test:lock:${Date.now()}:success`;
        const payload = { foo: 'bar' };

        const result = await IdempotencyLock.tryAcquire(key, payload);

        expect(result.acquired).toBe(true);
        expect(result.lock).toBeTruthy();
        expect(result.lock.key).toBe(key);
        expect(result.lock.status).toBe('processing');
        expect(result.lock.payload).toEqual(payload);
    });

    it('duplicate tryAcquire returns acquired=false with existing lock', async () => {
        const key = `test:lock:${Date.now()}:dup`;

        const first = await IdempotencyLock.tryAcquire(key, { attempt: 1 });
        expect(first.acquired).toBe(true);

        const second = await IdempotencyLock.tryAcquire(key, { attempt: 2 });
        expect(second.acquired).toBe(false);
        expect(second.lock).toBeTruthy();
        expect(second.lock.key).toBe(key);
        expect(second.lock.status).toBe('processing');
    });

    it('duplicate returns completed lock with cached result', async () => {
        const key = `test:lock:${Date.now()}:completed`;
        const result = { transactionId: 'TX123', status: 'confirmed' };

        await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.completeLock(key, result);

        const dup = await IdempotencyLock.tryAcquire(key);
        expect(dup.acquired).toBe(false);
        expect(dup.lock.status).toBe('completed');
        expect(dup.lock.result).toEqual(result);
    });
});

describe('IdempotencyLock — completeLock and failLock', () => {
    it('completeLock sets status=completed with result', async () => {
        const key = `test:lock:${Date.now()}:complete`;
        await IdempotencyLock.tryAcquire(key);

        const updated = await IdempotencyLock.completeLock(key, { success: true });

        expect(updated.status).toBe('completed');
        expect(updated.result).toEqual({ success: true });
        expect(updated.completedAt).toBeTruthy();
        expect(updated.errorMessage).toBe('');
    });

    it('failLock sets status=failed with error message', async () => {
        const key = `test:lock:${Date.now()}:fail`;
        await IdempotencyLock.tryAcquire(key);

        const updated = await IdempotencyLock.failLock(key, 'Network timeout');

        expect(updated.status).toBe('failed');
        expect(updated.errorMessage).toBe('Network timeout');
        expect(updated.completedAt).toBeTruthy();
    });
});

describe('IdempotencyLock — stale lock detection', () => {
    it('findStaleLocks returns processing locks older than threshold', async () => {
        const key = `test:lock:${Date.now()}:stale`;

        // Create a lock and manually backdate it beyond the 5-minute threshold
        const { lock } = await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.updateOne(
            { key },
            { $set: { lockedAt: new Date(Date.now() - 10 * 60 * 1000) } } // 10 minutes ago
        );

        const staleLocks = await IdempotencyLock.findStaleLocks();
        const found = staleLocks.find(l => l.key === key);

        expect(found).toBeTruthy();
        expect(found.status).toBe('processing');
    });

    it('findStaleLocks ignores recent processing locks', async () => {
        const key = `test:lock:${Date.now()}:fresh`;
        await IdempotencyLock.tryAcquire(key);

        const staleLocks = await IdempotencyLock.findStaleLocks();
        const found = staleLocks.find(l => l.key === key);

        expect(found).toBeFalsy();
    });

    it('findStaleLocks ignores completed locks', async () => {
        const key = `test:lock:${Date.now()}:completed-stale`;
        await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.completeLock(key, { done: true });

        // Backdate even though completed — should NOT appear in stale
        await IdempotencyLock.updateOne(
            { key },
            { $set: { lockedAt: new Date(Date.now() - 10 * 60 * 1000) } }
        );

        const staleLocks = await IdempotencyLock.findStaleLocks();
        const found = staleLocks.find(l => l.key === key);

        expect(found).toBeFalsy();
    });
});

describe('IdempotencyLock — retry mechanics', () => {
    it('findRetryable returns failed locks with retryCount < maxRetries', async () => {
        const key = `test:lock:${Date.now()}:retryable`;
        await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.failLock(key, 'Temporary failure');

        const retryable = await IdempotencyLock.findRetryable();
        const found = retryable.find(l => l.key === key);

        expect(found).toBeTruthy();
        expect(found.status).toBe('failed');
    });

    it('findRetryable excludes locks at maxRetries', async () => {
        const key = `test:lock:${Date.now()}:maxed`;
        await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.failLock(key, 'Permanent failure');

        // Set retryCount to maxRetries
        await IdempotencyLock.updateOne(
            { key },
            { $set: { retryCount: 3, maxRetries: 3 } }
        );

        const retryable = await IdempotencyLock.findRetryable();
        const found = retryable.find(l => l.key === key);

        expect(found).toBeFalsy();
    });

    it('claimForRetry atomically sets status to processing and increments retryCount', async () => {
        const key = `test:lock:${Date.now()}:claim`;
        await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.failLock(key, 'Retriable error');

        const claimed = await IdempotencyLock.claimForRetry(key);

        expect(claimed).toBeTruthy();
        expect(claimed.status).toBe('processing');
        expect(claimed.retryCount).toBe(1);
    });

    it('claimForRetry returns null if lock is already claimed', async () => {
        const key = `test:lock:${Date.now()}:already-claimed`;
        await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.failLock(key, 'Error');

        // First claim succeeds
        const first = await IdempotencyLock.claimForRetry(key);
        expect(first).toBeTruthy();

        // Second claim returns null — lock is now 'processing', not 'failed'
        const second = await IdempotencyLock.claimForRetry(key);
        expect(second).toBeNull();
    });
});

// ── CONCURRENCY TESTS ────────────────────────────────────────────────────────

describe('IdempotencyLock — concurrent acquisition', () => {
    it('only one of N concurrent tryAcquire calls wins', async () => {
        const key = `test:lock:${Date.now()}:concurrent`;
        const numConcurrent = 10;

        const results = await Promise.all(
            Array.from({ length: numConcurrent }, () =>
                IdempotencyLock.tryAcquire(key, { timestamp: Date.now() })
            )
        );

        const winners = results.filter(r => r.acquired === true);
        const losers = results.filter(r => r.acquired === false);

        // Exactly one winner
        expect(winners).toHaveLength(1);
        // All others are losers
        expect(losers).toHaveLength(numConcurrent - 1);
        // All losers reference the same key
        losers.forEach(l => expect(l.lock.key).toBe(key));
    });

    it('concurrent claimForRetry on same lock produces exactly one winner', async () => {
        const key = `test:lock:${Date.now()}:concurrent-claim`;
        await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.failLock(key, 'Error');

        const numConcurrent = 5;
        const results = await Promise.all(
            Array.from({ length: numConcurrent }, () =>
                IdempotencyLock.claimForRetry(key)
            )
        );

        const winners = results.filter(r => r !== null);
        const losers = results.filter(r => r === null);

        // Exactly one worker gets the lock
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(numConcurrent - 1);
        expect(winners[0].status).toBe('processing');
        expect(winners[0].retryCount).toBe(1);
    });
});
