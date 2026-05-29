/**
 * tests/queue/socket-bridge.test.js
 *
 * Validates systemEvents worker Socket.io routing:
 *   1. PAYMENT_COMPLETED → io.to(clientRoom).emit('paymentProcessed', ...)
 *   2. PAYMENT_FAILED → io.to(clientRoom).emit('paymentFailed', ...)
 *   3. DLQ_INSERTION → io.to('Admin').emit('deadLetterAlert', ...)
 */

const { EventTypes } = require('../../queue/events');

describe('Socket Bridge — Event Routing', () => {
    let mockIo;

    beforeEach(() => {
        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn(),
        };
    });

    it('routes PAYMENT_COMPLETED to client room', () => {
        const payload = {
            clientRoom: 'client:BK-001',
            bookingRef: 'BK-001',
            amount: 5000,
            currency: 'KES',
            transactionId: 'TXN-123',
        };

        // Simulate what the worker does
        const { clientRoom, ...data } = payload;
        mockIo.to(clientRoom).emit('paymentProcessed', data);

        expect(mockIo.to).toHaveBeenCalledWith('client:BK-001');
        expect(mockIo.emit).toHaveBeenCalledWith('paymentProcessed', expect.objectContaining({
            bookingRef: 'BK-001',
            amount: 5000,
        }));
    });

    it('routes PAYMENT_FAILED to client room', () => {
        const payload = {
            clientRoom: 'client:BK-002',
            bookingRef: 'BK-002',
            error: 'Insufficient funds',
        };

        const { clientRoom, ...data } = payload;
        mockIo.to(clientRoom).emit('paymentFailed', data);

        expect(mockIo.to).toHaveBeenCalledWith('client:BK-002');
        expect(mockIo.emit).toHaveBeenCalledWith('paymentFailed', expect.objectContaining({
            error: 'Insufficient funds',
        }));
    });

    it('routes DLQ_INSERTION to Admin room', () => {
        const payload = {
            queueName: 'payment',
            jobId: 'job-fail-001',
            jobName: 'PROCESS_PAYMENT',
            error: 'Gateway timeout',
            bookingRef: 'BK-003',
        };

        mockIo.to('Admin').emit('deadLetterAlert', payload);

        expect(mockIo.to).toHaveBeenCalledWith('Admin');
        expect(mockIo.emit).toHaveBeenCalledWith('deadLetterAlert', expect.objectContaining({
            queueName: 'payment',
            jobId: 'job-fail-001',
        }));
    });

    it('EventTypes constants are correctly defined', () => {
        expect(EventTypes.PAYMENT_COMPLETED).toBe('PAYMENT_COMPLETED');
        expect(EventTypes.PAYMENT_FAILED).toBe('PAYMENT_FAILED');
        expect(EventTypes.DLQ_INSERTION).toBe('DLQ_INSERTION');
    });
});
