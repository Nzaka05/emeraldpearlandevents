/**
 * API Contract Tests — Bookings
 * Tests ACTUAL live booking routes: POST /api/v1/book-event, GET /api/v1/booking/:bookingId, PATCH /api/v1/booking/:bookingId/status
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server-prod');
const Booking = require('../../server/models/Booking');
const Customer = require('../../server/models/Customer');
const { createAdminToken } = require('../helpers/auth.helper');

describe('Bookings API Contracts (Live Routes)', () => {
    let customerId, bookingId, adminToken;

    beforeEach(async () => {
        // Generate a valid admin JWT for auth-gated routes
        adminToken = createAdminToken();

        const customer = await Customer.create({
            name: 'API Test Client',
            email: 'api@test.local',
            phone: '254712345678'
        });
        customerId = customer._id;
    });

    describe('POST /api/v1/book-event (Create Booking)', () => {
        it('should return 200 with booking data on valid input', async () => {
            const response = await request(app)
                .post('/api/v1/book-event')
                .send({
                    fullName: 'Test Client',
                    phone: '254712345678',
                    email: 'client@test.local',
                    eventType: 'Wedding',
                    eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    eventDuration: '8 hours',
                    location: 'Test Venue',
                    guestCount: 150,
                    budgetRange: 'KES 250,000 – 500,000'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('bookingId');
            expect(response.body).toHaveProperty('bookingReference');
        });

        it('should return 400 with error on missing required fields', async () => {
            const response = await request(app)
                .post('/api/v1/book-event')
                .send({
                    fullName: 'Test Client'
                    // Missing email, phone, eventType
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
        });

        it('should return 400 with validation error on invalid email', async () => {
            const response = await request(app)
                .post('/api/v1/book-event')
                .send({
                    fullName: 'Test Client',
                    phone: '254712345678',
                    email: 'invalid-email-format',
                    eventType: 'Wedding',
                    eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    eventDuration: '8 hours',
                    location: 'Test Venue',
                    guestCount: 150,
                    budgetRange: 'KES 250,000 – 500,000'
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
        });

        it('should normalize eventType aliases correctly', async () => {
            const response = await request(app)
                .post('/api/v1/book-event')
                .send({
                    fullName: 'Test Client',
                    phone: '254712345678',
                    email: 'client@test.local',
                    eventType: 'wedding',
                    eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    eventDuration: '8 hours',
                    location: 'Test Venue',
                    guestCount: 150,
                    budgetRange: 'KES 250,000 – 500,000'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('bookingReference');
        });

        it('should reject past event dates', async () => {
            const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
            const response = await request(app)
                .post('/api/v1/book-event')
                .send({
                    fullName: 'Test Client',
                    phone: '254712345678',
                    email: 'client@test.local',
                    eventType: 'Wedding',
                    eventDate: pastDate,
                    eventDuration: '8 hours',
                    location: 'Test Venue',
                    guestCount: 150,
                    budgetRange: 'KES 250,000 – 500,000'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/booking/:bookingId (Retrieve Booking)', () => {
        beforeEach(async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Test Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000',
                bookingReference: 'TEST-123456'
            });
            bookingId = booking._id.toString();
        });

        it('should return 200 with booking data for valid id', async () => {
            const response = await request(app)
                .get(`/api/v1/booking/${bookingId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('booking');
            expect(response.body.booking._id).toBe(bookingId);
            expect(response.body.booking.eventType).toBe('Wedding');
        });

        it('should return 404 for non-existent booking', async () => {
            const fakeId = '507f1f77bcf86cd799439011';
            const response = await request(app)
                .get(`/api/v1/booking/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('success', false);
        });

        it('should return 400 for invalid booking id format', async () => {
            const response = await request(app)
                .get('/api/v1/booking/not-a-valid-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
        });
    });

    describe('PATCH /api/v1/bookings/:id/confirm', () => {
        beforeEach(async () => {
            const booking = await Booking.create({
                customerId,
                eventType: 'Wedding',
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                eventDuration: '8 hours',
                location: 'Test Venue',
                guests: 150,
                budgetRange: 'KES 250,000 – 500,000',
                status: 'new'
            });
            bookingId = booking._id.toString();
        });

        it('should return 200 with updated booking on valid status', async () => {
            const response = await request(app)
                .patch(`/api/v1/booking/${bookingId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'confirmed' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('booking');
            expect(response.body.booking.status).toBe('confirmed');
        });

        it('should return 404 for non-existent booking', async () => {
            const fakeId = '507f1f77bcf86cd799439011';
            const response = await request(app)
                .patch(`/api/v1/booking/${fakeId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'confirmed' });

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('success', false);
        });

        it('should return 400 for invalid status', async () => {
            const response = await request(app)
                .patch(`/api/v1/booking/${bookingId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'invalid_status' });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /health/ready (Health Check)', () => {
        it('should return 200 with health status', async () => {
            const response = await request(app)
                .get('/health/ready');

            expect([200, 503]).toContain(response.status);
            expect(response.body).toHaveProperty('status');
            // Note: /health/ready is a lightweight endpoint (status + uptime + timestamp).
            // Full checks with mongodb/redis/queues are only on /health/deep (HMAC-protected).
            expect(response.body).toHaveProperty('uptime');
        });
    });

    describe('GET /health/live (Liveness Check)', () => {
        it('should return 200 immediately without dependency checks', async () => {
            const response = await request(app)
                .get('/health/live');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'ok');
            expect(response.body).toHaveProperty('uptime');
        });
    });
});
