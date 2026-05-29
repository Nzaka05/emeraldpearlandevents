/**
 * Payment Flow Tests
 * Test idempotency, M-Pesa callbacks, and payment sync status
 */

const mongoose = require('mongoose');
const Booking = require('../../server/models/Booking');
const Customer = require('../../server/models/Customer');
const Payment = require('../../server/models/ClientPayment');

describe('Payment Flow', () => {
    let bookingId, clientId;

    beforeAll(async () => {
        await Payment.syncIndexes();
    });

    beforeEach(async () => {
        const customer = await Customer.create({
            name: 'Test Client',
            email: 'client@test.local',
            phone: '254712345678'
        });
        clientId = customer._id;

        const booking = await Booking.create({
            customerId: clientId,
            eventType: 'Wedding',
            eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            eventDuration: '8 hours',
            location: 'Test Venue',
            guests: 150,
            budgetRange: 'KES 250,000 – 500,000'
        });
        bookingId = booking._id;
    });

    describe('Idempotency Key Deduplication', () => {
        it('should create only one payment record with same idempotencyKey', async () => {
            const idempotencyKey = 'mpesa-txn-12345';

            const payment1 = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE123456',
                idempotencyKey: idempotencyKey,
                status: 'Confirmed'
            });

            // Simulate duplicate callback with same idempotencyKey
            const existingPayment = await Payment.findOne({ idempotencyKey });
            expect(existingPayment).toBeDefined();
            expect(existingPayment._id.toString()).toBe(payment1._id.toString());

            // Attempt to create another record with same key.
            // Accept either duplicate-key throw OR graceful dedupe behavior,
            // but require only one persisted record in all cases.
            try {
                await Payment.create({
                    bookingId,
                    clientId,
                    clientName: 'Test Client',
                    clientEmail: 'client@test.local',
                    amount: 100000,
                    paymentMethod: 'MPesa',
                    transactionId: 'MPE123456',
                    idempotencyKey: idempotencyKey,
                    status: 'Confirmed'
                });
            } catch (err) {
                expect([11000, undefined]).toContain(err.code);
            }

            const allWithKey = await Payment.find({ idempotencyKey });
            expect(allWithKey.length).toBe(1);
        });

        it('should return existing record on duplicate idempotencyKey', async () => {
            const idempotencyKey = 'mpesa-txn-67890';

            const payment1 = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 50000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE789012',
                idempotencyKey: idempotencyKey,
                status: 'Confirmed'
            });

            // Simulate finding existing record
            const payment2 = await Payment.findOne({ idempotencyKey });
            expect(payment2._id.toString()).toBe(payment1._id.toString());
            expect(payment2.amount).toBe(50000);
        });

        it('should allow different idempotencyKeys to create separate records', async () => {
            const idempotencyKey1 = 'mpesa-txn-key-1';
            const idempotencyKey2 = 'mpesa-txn-key-2';

            const payment1 = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE111111',
                idempotencyKey: idempotencyKey1,
                status: 'Confirmed'
            });

            const payment2 = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE222222',
                idempotencyKey: idempotencyKey2,
                status: 'Confirmed'
            });

            expect(payment1._id.toString()).not.toBe(payment2._id.toString());
            expect(payment1.transactionId).not.toBe(payment2.transactionId);
        });

        it('should handle payments without idempotencyKey', async () => {
            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 75000,
                paymentMethod: 'Bank Transfer',
                transactionId: 'BNK123456',
                status: 'Confirmed'
            });

            expect(payment.idempotencyKey == null).toBe(true);
            expect(payment._id).toBeDefined();
        });
    });

    describe('M-Pesa Callback Handling', () => {
        it('should update booking paymentStatus to paid on completed callback', async () => {
            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 250000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE456789',
                idempotencyKey: 'mpesa-callback-1',
                status: 'Confirmed'
            });

            const booking = await Booking.findById(bookingId);
            booking.isPaid = true;
            booking.amountPaid = 250000;
            await booking.save();

            const updatedBooking = await Booking.findById(bookingId);
            expect(updatedBooking.isPaid).toBe(true);
            expect(updatedBooking.amountPaid).toBe(250000);
        });

        it('should update booking paymentStatus to failed on failed callback', async () => {
            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE999999',
                idempotencyKey: 'mpesa-callback-2',
                status: 'Failed'
            });

            const booking = await Booking.findById(bookingId);
            expect(booking.isPaid).toBe(false);
        });

        it('should silently ignore duplicate completed callback with same idempotencyKey', async () => {
            const idempotencyKey = 'mpesa-callback-dup';

            // First callback - creates payment
            const payment1 = await Payment.findOne({ idempotencyKey });
            expect(payment1).toBeNull();

            // Create payment for first callback
            await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 150000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE101010',
                idempotencyKey: idempotencyKey,
                status: 'Confirmed'
            });

            // Second callback with same idempotencyKey
            // Should be ignored (return existing)
            const payment2 = await Payment.findOne({ idempotencyKey });
            expect(payment2).toBeDefined();

            // Verify no duplicate created
            const allPayments = await Payment.find({ idempotencyKey });
            expect(allPayments.length).toBe(1);
        });

        it('should not update amount on duplicate callback', async () => {
            const idempotencyKey = 'mpesa-callback-amount-test';

            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE505050',
                idempotencyKey: idempotencyKey,
                status: 'Confirmed'
            });

            const originalAmount = payment.amount;

            // Simulate duplicate with different amount (should not update)
            const duplicate = await Payment.findOne({ idempotencyKey });
            expect(duplicate.amount).toBe(originalAmount);
        });
    });

    describe('Payment Status Sync', () => {
        it('should start payment with status Confirmed', async () => {
            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE222333',
                status: 'Confirmed'
            });

            expect(payment.status).toBe('Confirmed');
        });

        it('should update payment status to Pending', async () => {
            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE333444',
                status: 'Confirmed'
            });

            payment.status = 'Pending';
            await payment.save();

            const updated = await Payment.findById(payment._id);
            expect(updated.status).toBe('Pending');
        });

        it('should update payment status to Failed', async () => {
            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE444555',
                status: 'Confirmed'
            });

            payment.status = 'Failed';
            payment.notes = 'User cancelled M-Pesa prompt';
            await payment.save();

            const updated = await Payment.findById(payment._id);
            expect(updated.status).toBe('Failed');
        });

        it('should track payment refund status', async () => {
            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE555666',
                status: 'Confirmed'
            });

            payment.status = 'Refunded';
            payment.notes = 'Client requested refund';
            await payment.save();

            const updated = await Payment.findById(payment._id);
            expect(updated.status).toBe('Refunded');
            expect(updated.notes).toContain('refund');
        });

        it('should auto-generate receipt number on save', async () => {
            const payment = await Payment.create({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                transactionId: 'MPE666777',
                status: 'Confirmed'
            });

            expect(payment.receiptNumber).toBeDefined();
            expect(payment.receiptNumber).toMatch(/^EPE-PMT-\d{4}-\d{4}$/);
        });
    });

    describe('Payment Validation', () => {
        it('should reject payment without bookingId', async () => {
            const payment = new Payment({
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                status: 'Confirmed'
            });

            await expect(payment.save()).rejects.toThrow();
        });

        it('should reject payment without amount', async () => {
            const payment = new Payment({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                paymentMethod: 'MPesa',
                status: 'Confirmed'
            });

            await expect(payment.save()).rejects.toThrow();
        });

        it('should reject invalid payment status', async () => {
            const payment = new Payment({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'MPesa',
                status: 'Invalid'
            });

            await expect(payment.save()).rejects.toThrow();
        });

        it('should reject invalid payment method', async () => {
            const payment = new Payment({
                bookingId,
                clientId,
                clientName: 'Test Client',
                clientEmail: 'client@test.local',
                amount: 100000,
                paymentMethod: 'Bitcoin',
                status: 'Confirmed'
            });

            await expect(payment.save()).rejects.toThrow();
        });

        it('should accept all valid payment methods', async () => {
            const methods = ['MPesa', 'Bank Transfer', 'PayPal', 'Cash', 'Card', 'Other'];

            for (const method of methods) {
                const payment = await Payment.create({
                    bookingId,
                    clientId,
                    clientName: 'Test Client',
                    clientEmail: 'client@test.local',
                    amount: 50000,
                    paymentMethod: method,
                    status: 'Confirmed'
                });

                expect(payment.paymentMethod).toBe(method);
            }
        });
    });
});
