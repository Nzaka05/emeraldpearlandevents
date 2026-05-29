/**
 * tests/queue/dead-letter-queue.test.js
 *
 * Validates DLQ behavior:
 *   1. Failed jobs are persisted to MongoDB with reference-only payload
 *   2. Raw M-Pesa callbacks / originalPayload are NEVER stored in DLQ
 *   3. DLQ entries include correct metadata (queueName, jobId, attempts)
 *   4. TTL field (expiresAt) is set to 30 days
 */

jest.mock('../../queue/queues', () => ({
    systemEventsQueue: { add: jest.fn().mockResolvedValue({}) },
    paymentQueue: { add: jest.fn() },
    notificationQueue: { add: jest.fn() },
    emailQueue: { add: jest.fn() },
    DEFAULT_JOB_OPTIONS: {},
}));

jest.mock('../../queue/models/DeadLetterJob', () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    return { create: mockCreate };
});

const DeadLetterJob = require('../../queue/models/DeadLetterJob');
const { persistToDeadLetter } = require('../../queue/deadLetterQueue');

describe('Dead Letter Queue — Reference-Only Payloads', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('stores only idempotencyKey and bookingRef in payload', async () => {
        const mockJob = {
            id: 'job-123',
            name: 'PROCESS_PAYMENT',
            queueName: 'payment',
            attemptsMade: 3,
            opts: { attempts: 3 },
            data: {
                bookingRef: 'BK-001',
                idempotencyKey: 'idem-001',
                amount: 50000,
                mpesaCallback: { rawPayload: 'SENSITIVE_DATA' },
                originalPayload: { fullTransaction: 'DO_NOT_STORE' },
            },
        };

        await persistToDeadLetter(mockJob, new Error('Payment gateway timeout'));

        expect(DeadLetterJob.create).toHaveBeenCalledTimes(1);

        const createdDoc = DeadLetterJob.create.mock.calls[0][0];

        // Verify reference-only payload
        expect(createdDoc.payload).toEqual({
            idempotencyKey: 'idem-001',
            bookingRef: 'BK-001',
        });

        // Verify raw data is NOT stored
        expect(createdDoc.payload.amount).toBeUndefined();
        expect(createdDoc.payload.mpesaCallback).toBeUndefined();
        expect(createdDoc.payload.originalPayload).toBeUndefined();
    });

    it('includes correct metadata fields', async () => {
        const mockJob = {
            id: 'job-456',
            name: 'PROCESS_PAYMENT',
            queueName: 'payment',
            attemptsMade: 3,
            opts: { attempts: 3 },
            data: {
                bookingRef: 'BK-002',
                idempotencyKey: 'idem-002',
                metadata: { timestamp: '2024-06-15T10:00:00Z' },
            },
        };

        await persistToDeadLetter(mockJob, 'Ledger write failed');

        const createdDoc = DeadLetterJob.create.mock.calls[0][0];

        expect(createdDoc.queueName).toBe('payment');
        expect(createdDoc.jobId).toBe('job-456');
        expect(createdDoc.jobName).toBe('PROCESS_PAYMENT');
        expect(createdDoc.error).toBe('Ledger write failed');
        expect(createdDoc.attempts).toBe(3);
        expect(createdDoc.originalTimestamp).toBe('2024-06-15T10:00:00Z');
    });

    it('sets 30-day TTL on expiresAt', async () => {
        const beforeCreate = Date.now();

        const mockJob = {
            id: 'job-789',
            name: 'SEND_EMAIL',
            queueName: 'email',
            attemptsMade: 3,
            opts: { attempts: 3 },
            data: { bookingRef: 'BK-003' },
        };

        await persistToDeadLetter(mockJob, new Error('SMTP timeout'));

        const createdDoc = DeadLetterJob.create.mock.calls[0][0];
        const expiresAt = new Date(createdDoc.expiresAt).getTime();
        const thirtyDaysFromNow = beforeCreate + 30 * 24 * 60 * 60 * 1000;

        // Allow 5 second tolerance
        expect(expiresAt).toBeGreaterThan(thirtyDaysFromNow - 5000);
        expect(expiresAt).toBeLessThan(thirtyDaysFromNow + 5000);
    });

    it('publishes DLQ_INSERTION event for admin alerting', async () => {
        const { systemEventsQueue } = require('../../queue/queues');

        const mockJob = {
            id: 'job-alert-001',
            name: 'PROCESS_PAYMENT',
            queueName: 'payment',
            attemptsMade: 3,
            opts: { attempts: 3 },
            data: { bookingRef: 'BK-ALERT' },
        };

        await persistToDeadLetter(mockJob, 'Test failure');

        expect(systemEventsQueue.add).toHaveBeenCalledTimes(1);
        const [eventType, envelope] = systemEventsQueue.add.mock.calls[0];
        expect(eventType).toBe('DLQ_INSERTION');
        expect(envelope.type).toBe('DLQ_INSERTION');
        expect(envelope.payload.bookingRef).toBe('BK-ALERT');
    });
});
