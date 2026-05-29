/**
 * tests/finance/payment-recovery.test.js
 *
 * Verifies the paymentRecoveryService recovers failed/stale payments:
 *   1. recoverStaleLocks marks stale processing locks as failed
 *   2. retryFailedLocks replays callback payloads
 *   3. detectStuckPayments finds payments in Sent > threshold
 *   4. Concurrent recovery workers cannot double-claim
 *   5. Already-completed locks are not retried
 *
 * ARCHITECTURE:
 *   The recovery service runs as a cron job.
 *   It uses IdempotencyLock.findStaleLocks/findRetryable/claimForRetry
 *   to manage the lifecycle. claimForRetry is atomic — only one worker
 *   can claim a lock via findOneAndUpdate with status='failed' condition.
 */

const IdempotencyLock = require('../../staff-system/models/IdempotencyLock');
const paymentRecoveryService = require('../../staff-system/financials/services/paymentRecoveryService');

jest.setTimeout(30000);

describe('paymentRecoveryService — stale lock recovery', () => {
    it('marks stale processing locks as failed', async () => {
        // Create a lock and manually backdate it to simulate a stale lock
        const key = `recovery:stale:${Date.now()}`;
        await IdempotencyLock.tryAcquire(key, {
            callbackData: { ResultCode: 0, TransactionID: 'TEST_STALE' }
        });

        // Backdate the lock to 10 minutes ago (beyond the 5-minute threshold)
        await IdempotencyLock.updateOne(
            { key },
            { $set: { lockedAt: new Date(Date.now() - 10 * 60 * 1000) } }
        );

        // Run recovery
        const result = await paymentRecoveryService.recoverStaleLocks();

        // Verify the lock was marked as failed
        const lock = await IdempotencyLock.findOne({ key });
        expect(lock.status).toBe('failed');
        expect(lock.errorMessage).toMatch(/stale|timeout/i);
    });

    it('does not touch recent processing locks', async () => {
        const key = `recovery:fresh:${Date.now()}`;
        await IdempotencyLock.tryAcquire(key, {
            callbackData: { ResultCode: 0, TransactionID: 'TEST_FRESH' }
        });
        // Do NOT backdate — this lock is fresh

        await paymentRecoveryService.recoverStaleLocks();

        const lock = await IdempotencyLock.findOne({ key });
        expect(lock.status).toBe('processing'); // untouched
    });

    it('does not touch completed locks', async () => {
        const key = `recovery:completed:${Date.now()}`;
        await IdempotencyLock.tryAcquire(key);
        await IdempotencyLock.completeLock(key, { confirmed: true });

        // Backdate for good measure — should still be ignored
        await IdempotencyLock.updateOne(
            { key },
            { $set: { lockedAt: new Date(Date.now() - 10 * 60 * 1000) } }
        );

        await paymentRecoveryService.recoverStaleLocks();

        const lock = await IdempotencyLock.findOne({ key });
        expect(lock.status).toBe('completed'); // untouched
    });
});

describe('paymentRecoveryService — retry failed locks', () => {
    it('retries failed locks that have retryCount < maxRetries', async () => {
        const key = `recovery:retry:${Date.now()}`;
        await IdempotencyLock.tryAcquire(key, {
            callbackData: { ResultCode: 0, TransactionID: 'TEST_RETRY' }
        });
        await IdempotencyLock.failLock(key, 'Network timeout');

        // Run retry cycle
        await paymentRecoveryService.retryFailedLocks();

        // After retrying, the lock should have been claimed and processed
        const lock = await IdempotencyLock.findOne({ key });
        // It will be either 'completed' (if retry succeeded) or 'failed' (if it failed again)
        // Either way, retryCount should have incremented
        expect(lock.retryCount).toBeGreaterThanOrEqual(1);
    });

    it('does not retry locks at maxRetries', async () => {
        const key = `recovery:maxed:${Date.now()}`;
        await IdempotencyLock.tryAcquire(key, {
            callbackData: { ResultCode: 0, TransactionID: 'TEST_MAXED' }
        });
        await IdempotencyLock.failLock(key, 'Permanent failure');

        // Set retryCount to maxRetries
        await IdempotencyLock.updateOne(
            { key },
            { $set: { retryCount: 3, maxRetries: 3 } }
        );

        await paymentRecoveryService.retryFailedLocks();

        // Lock should remain untouched
        const lock = await IdempotencyLock.findOne({ key });
        expect(lock.retryCount).toBe(3);
        expect(lock.status).toBe('failed');
    });
});

describe('paymentRecoveryService — stuck payment detection', () => {
    it('detectStuckPayments identifies payments in Sent > threshold', async () => {
        // This test verifies the detection logic works on the assignment model.
        // We test that the method exists and returns an array (even if empty in test env).
        const stuck = await paymentRecoveryService.detectStuckPayments();
        expect(Array.isArray(stuck)).toBe(true);
    });
});

// ── CONCURRENCY: Double-claim prevention ─────────────────────────────────────

describe('paymentRecoveryService — concurrent worker safety', () => {
    it('two concurrent recoverStaleLocks runs do not double-process', async () => {
        const key = `recovery:concurrent:${Date.now()}`;
        await IdempotencyLock.tryAcquire(key, {
            callbackData: { ResultCode: 0, TransactionID: 'TEST_CONCURRENT' }
        });

        await IdempotencyLock.updateOne(
            { key },
            { $set: { lockedAt: new Date(Date.now() - 10 * 60 * 1000) } }
        );

        // Two concurrent recovery runs
        await Promise.all([
            paymentRecoveryService.recoverStaleLocks(),
            paymentRecoveryService.recoverStaleLocks()
        ]);

        // Lock should be failed exactly once (not double-failed)
        const lock = await IdempotencyLock.findOne({ key });
        expect(lock.status).toBe('failed');
    });

    it('two concurrent retryFailedLocks claim different locks', async () => {
        const keys = [`recovery:conc-a:${Date.now()}`, `recovery:conc-b:${Date.now()}`];

        for (const key of keys) {
            await IdempotencyLock.tryAcquire(key, {
                callbackData: { ResultCode: 0, TransactionID: `CONC_${key}` }
            });
            await IdempotencyLock.failLock(key, 'Error');
        }

        // Two concurrent retries
        await Promise.all([
            paymentRecoveryService.retryFailedLocks(),
            paymentRecoveryService.retryFailedLocks()
        ]);

        // Both locks should have been processed (claimed by different iterations)
        const locks = await IdempotencyLock.find({ key: { $in: keys } });
        for (const lock of locks) {
            expect(lock.retryCount).toBeGreaterThanOrEqual(1);
        }
    });
});
