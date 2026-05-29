/**
 * API Contract Tests - Authentication Routes
 * Hardened to validate mounted canonical auth endpoints.
 */

const request = require('supertest');

let app;

describe('Authentication Routes - Contract Tests', () => {
  beforeAll(() => {
    app = require('../../server-prod');
  });

  describe('POST /api/v1/admin/login - Admin Login', () => {
    it('should reject empty admin credentials', async () => {
      const res = await request(app)
        .post('/api/v1/admin/login')
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(401);
    });

    it('should reject invalid admin credentials', async () => {
      const res = await request(app)
        .post('/api/v1/admin/login')
        .set('Content-Type', 'application/json')
        .send({ email: 'nobody@example.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/admin/logout - Admin Logout', () => {
    it('should accept admin logout without throwing route errors', async () => {
      const res = await request(app)
        .post('/api/v1/admin/logout')
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });
  });

  describe('GET /api/v1/admin/me - Admin Token Verification', () => {
    it('should reject missing authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/admin/me');

      expect([401, 403]).toContain(res.status);
    });

    it('should reject malformed authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/admin/me')
        .set('Authorization', 'InvalidFormat token-here');

      expect([401, 403]).toContain(res.status);
    });
  });

  describe('POST /api/v1/client/api/login - Client Login', () => {
    it('should reject invalid client credentials', async () => {
      const res = await request(app)
        .post('/api/v1/client/api/login')
        .set('Content-Type', 'application/json')
        .send({ email: 'attacker@example.com', password: 'wrong-password' });

      expect([401, 403, 423, 429]).toContain(res.status);
    });
  });

  describe('POST /api/v1/client/api/refresh-token - Client Token Refresh', () => {
    it('should reject missing refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/client/api/refresh-token')
        .set('Content-Type', 'application/json')
        .send({});

      // Phase 2 hardened: missing token is an auth failure (401), not validation (400)
      expect(res.status).toBe(401);
    });

    it('should reject malformed refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/client/api/refresh-token')
        .set('Content-Type', 'application/json')
        .send({ refreshToken: 'not-a-valid-refresh-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/client/api/logout - Client Logout', () => {
    it('should reject unauthenticated logout requests', async () => {
      const res = await request(app)
        .post('/api/v1/client/api/logout')
        .set('Content-Type', 'application/json');

      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Authentication Rate Limiting', () => {
    it('should handle repeated client login attempts without route-level failures', async () => {
      const credentials = {
        email: 'attacker@example.com',
        password: 'wrong-password'
      };

      const attempts = Array(20).fill(null).map(() =>
        request(app)
          .post('/api/v1/client/api/login')
          .set('Content-Type', 'application/json')
          .send(credentials)
      );

      const results = await Promise.all(attempts);
      const allValid = results.every(r => [401, 403, 423, 429].includes(r.status));

      expect(allValid).toBe(true);
    });
  });

  describe('Cross-Origin Request Handling', () => {
    it('should handle CORS preflight for mounted auth endpoint', async () => {
      const res = await request(app)
        .options('/api/v1/admin/login')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect([200, 204, 403]).toContain(res.status);
    });
  });
});
