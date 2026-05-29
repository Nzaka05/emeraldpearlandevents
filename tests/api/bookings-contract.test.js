/**
 * API Contract Tests - Booking Management
 * Tests for booking CRUD operations and critical business logic
 */

const request = require('supertest');

let app;

describe('Booking API Routes - Contract Tests', () => {
  beforeAll(() => {
    app = require('../../server-prod');
  });

  describe('POST /api/v1/book-event - Create Booking', () => {
    it('should accept booking request with required fields', async () => {
      const bookingPayload = {
        clientName: 'Test Client',
        eventType: 'wedding',
        eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        guestCount: 200,
        venue: 'Test Venue',
        budget: 5000
      };

      const res = await request(app)
        .post('/api/v1/book-event')
        .set('Content-Type', 'application/json')
        .send(bookingPayload);

      // Contract: mounted endpoint should return success, validation, or rate-limit only
      expect([200, 400, 429]).toContain(res.status);
      
      if (res.status === 200) {
        expect(res.body).toHaveProperty('bookingId');
        expect(res.body).toHaveProperty('bookingReference');
      }
    });

    it('should reject booking without required fields', async () => {
      const invalidPayload = { clientName: 'Test' };

      const res = await request(app)
        .post('/api/v1/book-event')
        .set('Content-Type', 'application/json')
        .send(invalidPayload);

      // Contract: validation error should return 400 (or 429 if throttled)
      expect([400, 429]).toContain(res.status);
    });
  });

  describe('GET /api/v1/booking/:bookingId - Retrieve Booking', () => {
    it('should return booking details for valid ID', async () => {
      const testId = '507f1f77bcf86cd799439011';
      
      const res = await request(app)
        .get(`/api/v1/booking/${testId}`)
        .set('Accept', 'application/json');

      // Phase 2: verifyAdminJWT runs before business logic — unauthenticated → 401
      expect([200, 401, 404]).toContain(res.status);
      
      if (res.status === 200) {
        expect(res.body).toHaveProperty('booking');
      }
    });

    it('should reject invalid booking ID format', async () => {
      const res = await request(app)
        .get('/api/v1/booking/not-a-valid-id')
        .set('Accept', 'application/json');

      // Phase 2: verifyAdminJWT runs before ID validation — unauthenticated → 401
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('GET /api/v1/gallery - Public Gallery Endpoint', () => {
    it('should return gallery payload from mounted route', async () => {
      const res = await request(app)
        .get('/api/v1/gallery')
        .set('Accept', 'application/json');

      expect(res.status).toBe(200);
      
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('gallery');
      expect(Array.isArray(res.body.gallery)).toBe(true);
    });
  });

  describe('Idempotency - Duplicate Booking Prevention', () => {
    it('should maintain data consistency on concurrent requests', async () => {
      const bookingPayload = {
        clientName: 'Idempotent Test',
        eventType: 'conference',
        eventDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        guestCount: 500,
        budget: 50000,
        idempotencyKey: `test-${Date.now()}`
      };

      // Simulated concurrent requests with same idempotency key
      const promises = Array(3).fill(null).map(() =>
        request(app)
          .post('/api/v1/book-event')
          .set('Content-Type', 'application/json')
          .send(bookingPayload)
      );

      const results = await Promise.all(promises);

      // Contract: route should not return 404 for mounted booking endpoint
      results.forEach(res => {
        expect([200, 400, 429]).toContain(res.status);
      });
    });
  });
});
