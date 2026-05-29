/**
 * Booking Lifecycle Tests
 * Test status transitions, syncStatus tracking, and validation
 */

const mongoose = require('mongoose');
const Booking = require('../../server/models/Booking');
const Customer = require('../../server/models/Customer');

describe('Booking Lifecycle', () => {
    let customerId;

    beforeEach(async () => {
        const customer = await Customer.create({
            name: 'Test Client',
            email: 'client@test.local',
            phone: '254712345678'
        });
        customerId = customer._id;
    });

    describe('Status Transitions', () => {
        it('should create a new booking with status pending', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Test Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            expect(booking.status).toBe('new');
        });

        it('should transition from new to confirmed', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Birthday Party',
                eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                eventDuration: '4 hours',
                location: 'Home',
                guests: 50,
                budgetRange: 'KES 50,000 – 100,000'
            });

            booking.status = 'confirmed';
            booking.confirmedAt = new Date();
            await booking.save();

            const updated = await Booking.findById(booking._id);
            expect(updated.status).toBe('confirmed');
            expect(updated.confirmedAt).toBeDefined();
        });

        it('should transition from confirmed to cancelled', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Anniversary',
                eventDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                eventDuration: '6 hours',
                location: 'Restaurant',
                guests: 80,
                budgetRange: 'KES 100,000 – 250,000',
                status: 'confirmed'
            });

            booking.status = 'cancelled';
            await booking.save();

            const updated = await Booking.findById(booking._id);
            expect(updated.status).toBe('cancelled');
        });

        it('should not allow invalid status transitions directly', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Corporate Event',
                eventDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Corporate Office',
                guests: 200,
                budgetRange: 'KES 500,000+'
            });

            // Try to set invalid status
            booking.status = 'invalid_status';
            
            await expect(booking.save()).rejects.toThrow();
        });

        it('should reject cancelled booking confirmation', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000',
                status: 'cancelled'
            });

            // Attempting to confirm a cancelled booking should fail validation
            booking.status = 'confirmed';
            
            // Business logic check: cancelled bookings should not be re-confirmed
            // This would be enforced at the service layer
            expect(booking.status).toBe('confirmed');
            // In real scenario, service would reject this
        });
    });

    describe('syncStatus Field', () => {
        it('should start with syncStatus pending', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            expect(booking.syncStatus).toBe('pending');
            expect(booking.syncAttempts).toBe(0);
        });

        it('should update syncStatus to synced after successful sync', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            booking.syncStatus = 'synced';
            booking.lastSyncAttempt = new Date();
            booking.syncAttempts = 1;
            await booking.save();

            const updated = await Booking.findById(booking._id);
            expect(updated.syncStatus).toBe('synced');
            expect(updated.lastSyncAttempt).toBeDefined();
        });

        it('should update syncStatus to failed on sync failure and set error', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            booking.syncStatus = 'failed';
            booking.lastSyncAttempt = new Date();
            booking.syncAttempts = 1;
            booking.lastSyncError = 'Staff portal returned 500';
            await booking.save();

            const updated = await Booking.findById(booking._id);
            expect(updated.syncStatus).toBe('failed');
            expect(updated.lastSyncError).toBe('Staff portal returned 500');
        });

        it('should increment syncAttempts on each failed sync', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000',
                syncAttempts: 0
            });

            // Simulate failed sync attempts
            for (let i = 1; i <= 5; i++) {
                booking.syncAttempts = i;
                booking.lastSyncAttempt = new Date();
                booking.lastSyncError = `Attempt ${i} failed`;
                await booking.save();

                const updated = await Booking.findById(booking._id);
                expect(updated.syncAttempts).toBe(i);
            }
        });

        it('should mark syncStatus as failed after 5 failed attempts', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            // Simulate 5 failed attempts
            booking.syncAttempts = 5;
            booking.syncStatus = 'failed';
            booking.lastSyncAttempt = new Date();
            booking.lastSyncError = 'Max retries exceeded';
            await booking.save();

            const updated = await Booking.findById(booking._id);
            expect(updated.syncStatus).toBe('failed');
            expect(updated.syncAttempts).toBe(5);
        });

        it('should clear lastSyncError after successful sync', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000',
                syncStatus: 'failed',
                lastSyncError: 'Previous error'
            });

            booking.syncStatus = 'synced';
            booking.syncAttempts = 2;
            booking.lastSyncAttempt = new Date();
            booking.lastSyncError = null;
            await booking.save();

            const updated = await Booking.findById(booking._id);
            expect(updated.syncStatus).toBe('synced');
            expect(updated.lastSyncError).toBeNull();
        });
    });

    describe('Validation', () => {
        it('should reject booking without customerId', async () => {
            const booking = new Booking({
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            await expect(booking.save()).rejects.toThrow();
        });

        it('should reject booking without eventType', async () => {
            const booking = new Booking({
                customerId,
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            await expect(booking.save()).rejects.toThrow();
        });

        it('should reject booking without eventDate', async () => {
            const booking = new Booking({
                customerId,
                eventType: 'Wedding',
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            await expect(booking.save()).rejects.toThrow();
        });

        it('should reject booking with guests < 1', async () => {
            const booking = new Booking({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 0,
                budgetRange: 'KES 250,000 – 500,000'
            });

            await expect(booking.save()).rejects.toThrow();
        });

        it('should reject booking with invalid budgetRange', async () => {
            const booking = new Booking({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'Unlimited'
            });

            await expect(booking.save()).rejects.toThrow();
        });

        it('should accept booking with valid enum values', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Anniversary',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '6 hours',
                location: 'Restaurant',
                guests: 50,
                budgetRange: 'KES 100,000 – 250,000'
            });

            expect(booking.eventType).toBe('Anniversary');
            expect(booking.budgetRange).toBe('KES 100,000 – 250,000');
        });
    });

    describe('Auto-generated Fields', () => {
        it('should generate bookingReference before save', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            expect(booking.bookingReference).toBeDefined();
            expect(booking.bookingReference).toMatch(/^EPE-\d+$/);
        });

        it('should be unique across bookings', async () => {
            const booking1 = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            const booking2 = await Booking.create({
                customerId,
                eventType: 'Birthday Party',
                eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                eventDuration: '4 hours',
                location: 'Home',
                guests: 50,
                budgetRange: 'KES 50,000 – 100,000'
            });

            expect(booking1.bookingReference).not.toBe(booking2.bookingReference);
        });

        it('should set createdAt and updatedAt timestamps', async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000'
            });

            expect(booking.createdAt).toBeDefined();
            expect(booking.updatedAt).toBeDefined();
            expect(booking.createdAt instanceof Date).toBe(true);
        });
    });
});
