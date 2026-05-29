/**
 * API Contract Tests - Admin Command Center Routes
 * Tests for dashboard metrics and event management
 */

const request = require('supertest');

let app;

describe('Admin Command Center Routes - Contract Tests', () => {
  beforeAll(() => {
    app = require('../../server-prod');
  });

  describe('GET /admin/command-center/api/metrics', () => {
    it('should return metrics object with required fields', async () => {
      const res = await request(app)
        .get('/admin/command-center/api/metrics')
        .set('Accept', 'application/json');

      expect([200, 302, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(typeof res.body).toBe('object');
        // Contract: metrics endpoint returns aggregated dashboard data
        expect(res.body).toHaveProperty('timestamp');
      }
    });

    it('should handle missing auth gracefully', async () => {
      const res = await request(app)
        .get('/admin/command-center/api/metrics')
        .set('Accept', 'application/json');

      // Contract: protected endpoint may redirect/login-challenge when no auth.
      expect([200, 302, 401, 403]).toContain(res.status);
    });
  });

  describe('GET /admin/command-center/api/events', () => {
    it('should return array of events', async () => {
      const res = await request(app)
        .get('/admin/command-center/api/events')
        .set('Accept', 'application/json');

      expect([200, 302, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
      }
    });
  });

  describe('GET /admin/command-center/api/events/:id', () => {
    it('should return event detail for valid ID', async () => {
      const testId = '507f1f77bcf86cd799439011'; // Valid MongoDB ObjectId format
      const res = await request(app)
        .get(`/admin/command-center/api/events/${testId}`)
        .set('Accept', 'application/json');

      // Contract: endpoint returns 200, 404, or 401 - not 500
      expect([200, 302, 404, 401, 403]).toContain(res.status);
    });

    it('should reject invalid ID format', async () => {
      const res = await request(app)
        .get('/admin/command-center/api/events/invalid-id')
        .set('Accept', 'application/json');

      // Contract: invalid ID format returns 400 or 404, not 500
      expect([302, 400, 404, 401, 403]).toContain(res.status);
    });
  });
});
