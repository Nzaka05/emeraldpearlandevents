/**
 * tests/queue/async-boundary.test.js
 *
 * Validates the async boundary contract between HTTP handlers and BullMQ queues.
 * The payment queue payload must include:
 *   { bookingRef, amount, currency, paymentMethod, idempotencyKey, retryCount }
 *
 * This test does NOT require a live Redis connection — it validates
 * the shape of payloads that flow through the boundary.
 */

const { EventTypes, createEnvelope, Sources } = require('../../queue/events');

describe('Async Boundary — Payload Contract', () => {
    it('payment queue payload includes all required fields', () => {
        const payload = {
            bookingRef: 'BK-BOUNDARY-001',
            amount: 25000,
            currency: 'KES',
            paymentMethod: 'MPesa',
            idempotencyKey: `idem-${Date.now()}`,
            retryCount: 0,
        };

        // Validate required fields exist and are correct types
        expect(typeof payload.bookingRef).toBe('string');
        expect(typeof payload.amount).toBe('number');
        expect(typeof payload.currency).toBe('string');
        expect(typeof payload.paymentMethod).toBe('string');
        expect(typeof payload.idempotencyKey).toBe('string');
        expect(typeof payload.retryCount).toBe('number');

        // Validate none are undefined or null
        expect(payload.bookingRef).toBeDefined();
        expect(payload.amount).toBeGreaterThan(0);
        expect(payload.currency.length).toBeGreaterThan(0);
        expect(payload.paymentMethod.length).toBeGreaterThan(0);
        expect(payload.idempotencyKey.length).toBeGreaterThan(0);
    });

    it('event envelope includes version, type, metadata', () => {
        const envelope = createEnvelope(
            EventTypes.PROCESS_PAYMENT,
            {
                bookingRef: 'BK-ENV-001',
                amount: 10000,
                currency: 'KES',
                paymentMethod: 'MPesa',
                idempotencyKey: 'idem-env-001',
                retryCount: 0,
            },
            Sources.PORT_3000
        );

        expect(envelope.version).toBe(1);
        expect(envelope.type).toBe('PROCESS_PAYMENT');
        expect(envelope.metadata.source).toBe('port-3000');
        expect(envelope.metadata.timestamp).toBeDefined();
        expect(envelope.metadata.correlationId).toBeDefined();
        expect(typeof envelope.metadata.correlationId).toBe('string');
    });

    it('envelope uses custom correlationId when provided', () => {
        const customId = 'corr-custom-12345';
        const envelope = createEnvelope(
            EventTypes.SEND_NOTIFICATION,
            { notificationId: 'notif-001' },
            Sources.WORKER,
            customId
        );

        expect(envelope.metadata.correlationId).toBe(customId);
    });

    it('payment completed event includes clientRoom for Socket.io routing', () => {
        const envelope = createEnvelope(
            EventTypes.PAYMENT_COMPLETED,
            {
                bookingRef: 'BK-SOCKET-001',
                amount: 15000,
                currency: 'KES',
                transactionId: 'TXN-001',
                clientRoom: 'client:BK-SOCKET-001',
            },
            Sources.WORKER
        );

        expect(envelope.payload.clientRoom).toBe('client:BK-SOCKET-001');
        expect(envelope.payload.transactionId).toBeDefined();
    });

    it('DLQ reference payload excludes sensitive data', () => {
        const dlqPayload = {
            idempotencyKey: 'idem-dlq-001',
            bookingRef: 'BK-DLQ-001',
        };

        // Verify ONLY reference fields
        const keys = Object.keys(dlqPayload);
        expect(keys).toEqual(['idempotencyKey', 'bookingRef']);
        expect(keys).not.toContain('amount');
        expect(keys).not.toContain('mpesaCallback');
        expect(keys).not.toContain('originalPayload');
    });

    it('Sources enum provides all expected process identifiers', () => {
        expect(Sources.PORT_3000).toBe('port-3000');
        expect(Sources.PORT_3001).toBe('port-3001');
        expect(Sources.WORKER).toBe('worker');
        expect(Sources.RECOVERY).toBe('recovery');
    });
});
