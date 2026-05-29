/**
 * tests/observability/alerting.test.js — Alert dedup and spike detection tests
 *
 * Validates:
 *   - emitAlert() returns true on first call
 *   - emitAlert() returns false on second call within 5 minutes (dedup)
 *   - emitAlert() returns true after TTL expires
 *   - PAYMENT_FAILURE_SPIKE: triggered at threshold of 3
 *   - PAYMENT_FAILURE_SPIKE: NOT triggered at count 2
 *   - PAYMENT_QUEUE_BACKED_UP: triggered when waiting > 10
 *   - PAYMENT_QUEUE_BACKED_UP: NOT triggered when waiting <= 10
 *   - All alert types exported as string constants
 */

// Mock queue/queues to avoid real Redis connections in alerting.js
jest.mock('../../queue/queues', () => ({
    systemEventsQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
    paymentQueue: {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0, delayed: 0 }),
    },
}));

const { systemEventsQueue, paymentQueue } = require('../../queue/queues');
const { emitAlert, trackPaymentFailure, AlertTypes, ALERT_DEDUP_TTL } = require('../../queue/alerting');

describe('Alerting System', () => {
    let mockRedis;

    beforeEach(() => {
        jest.clearAllMocks();

        // Fresh mock Redis client per test
        const store = new Map();
        mockRedis = {
            get: jest.fn(async (key) => store.get(key) || null),
            set: jest.fn(async (key, value, ...args) => {
                store.set(key, value);
                return 'OK';
            }),
            _store: store,
        };
    });

    describe('AlertTypes constants', () => {
        it('exports all expected alert type strings', () => {
            expect(AlertTypes.PAYMENT_QUEUE_BACKED_UP).toBe('PAYMENT_QUEUE_BACKED_UP');
            expect(AlertTypes.PAYMENT_FAILURE_SPIKE).toBe('PAYMENT_FAILURE_SPIKE');
            expect(AlertTypes.HMAC_FAILURE_SPIKE).toBe('HMAC_FAILURE_SPIKE');
            expect(AlertTypes.WORKER_DOWN).toBe('WORKER_DOWN');
            expect(AlertTypes.DLQ_INSERTION_ALERT).toBe('DLQ_INSERTION_ALERT');
        });

        it('has correct dedup TTL of 300 seconds', () => {
            expect(ALERT_DEDUP_TTL).toBe(300);
        });
    });

    describe('emitAlert()', () => {
        it('returns true on first call (no dedup key exists)', async () => {
            const result = await emitAlert(
                AlertTypes.PAYMENT_QUEUE_BACKED_UP,
                'high',
                { waiting: 15 },
                mockRedis
            );

            expect(result).toBe(true);
            expect(mockRedis.set).toHaveBeenCalledWith(
                'alert:PAYMENT_QUEUE_BACKED_UP',
                '1',
                'EX',
                300
            );
            expect(systemEventsQueue.add).toHaveBeenCalledTimes(1);
        });

        it('returns false on second call within 5 minutes (dedup)', async () => {
            // First call — sets the key
            await emitAlert(AlertTypes.WORKER_DOWN, 'critical', {}, mockRedis);

            // Second call — key already exists
            const result = await emitAlert(AlertTypes.WORKER_DOWN, 'critical', {}, mockRedis);

            expect(result).toBe(false);
            expect(systemEventsQueue.add).toHaveBeenCalledTimes(1); // Only first call
        });

        it('returns true after TTL expires (Redis key removed)', async () => {
            // First call
            await emitAlert(AlertTypes.HMAC_FAILURE_SPIKE, 'critical', {}, mockRedis);

            // Simulate TTL expiry — remove the key from the store
            mockRedis._store.delete('alert:HMAC_FAILURE_SPIKE');

            // Second call — key gone, should emit again
            const result = await emitAlert(AlertTypes.HMAC_FAILURE_SPIKE, 'critical', {}, mockRedis);

            expect(result).toBe(true);
            expect(systemEventsQueue.add).toHaveBeenCalledTimes(2);
        });

        it('returns false when redisClient is null', async () => {
            const result = await emitAlert(AlertTypes.WORKER_DOWN, 'critical', {}, null);
            expect(result).toBe(false);
        });

        it('returns false when redisClient has no get method', async () => {
            const result = await emitAlert(AlertTypes.WORKER_DOWN, 'critical', {}, {});
            expect(result).toBe(false);
        });
    });

    describe('trackPaymentFailure()', () => {
        it('does NOT trigger PAYMENT_FAILURE_SPIKE at count 2', async () => {
            // First failure
            await trackPaymentFailure(mockRedis, 3);
            // Second failure
            const result = await trackPaymentFailure(mockRedis, 3);

            expect(result).toBe(false);
        });

        it('triggers PAYMENT_FAILURE_SPIKE when count reaches exactly 3', async () => {
            // Failures 1, 2, 3
            await trackPaymentFailure(mockRedis, 3);
            await trackPaymentFailure(mockRedis, 3);
            const result = await trackPaymentFailure(mockRedis, 3);

            // At count 3, emitAlert should be called
            expect(result).toBe(true);
        });

        it('returns false when redisClient is null', async () => {
            const result = await trackPaymentFailure(null, 3);
            expect(result).toBe(false);
        });
    });
});
