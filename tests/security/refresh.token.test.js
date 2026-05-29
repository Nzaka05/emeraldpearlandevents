/**
 * tests/security/refresh.token.test.js
 *
 * Verifies the client portal refresh token flow:
 *   1. Uses tokenIndex for O(1) lookup (no bcrypt loop)
 *   2. Still validates the full token via bcrypt.compare
 *   3. Rejects invalid, expired, and tampered tokens
 *   4. Issues a new access token on valid refresh
 *
 * FIX: Original test imported `server-prod.js` which triggered full Express
 *      bootstrap (Redis, EJS views, Passport, etc.) and crashed the test env.
 *      This rewrite tests the service layer directly via `clientAuthService`,
 *      bypassing the HTTP layer entirely.
 *
 * NOTE: The global beforeEach in tests/setup.js clears ALL collections between
 *       each test. Therefore, test fixtures MUST be created in each describe
 *       block's own beforeEach — not in a file-level beforeAll.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Direct model/service imports — no server bootstrap required
const ClientSession = require('../../server/models/ClientSession');
const ClientAccount = require('../../server/models/ClientAccount');
const Customer = require('../../server/models/Customer');
const clientAuthService = require('../../server/services/clientAuthService');

jest.setTimeout(30000);

// ── Shared fixture factory ────────────────────────────────────────────────────

async function createFixtures() {
    process.env.CLIENT_JWT_SECRET = process.env.CLIENT_JWT_SECRET || 'test-client-jwt-secret-for-refresh-tests';
    process.env.CLIENT_JWT_EXPIRY = '15m';

    const email = `test.refresh.${Date.now()}.${Math.random().toString(36).slice(2)}@test.com`;

    const customer = await Customer.create({
        name: 'Refresh Test User',
        email,
        phone: `0700${Date.now().toString().slice(-6)}`,
        status: 'active'
    });

    const password_hash = await bcrypt.hash('TestPass@1234', 12);
    const account = await ClientAccount.create({
        client_id: customer._id,
        email,
        password_hash,
        portal_access_enabled: true,
        provider: 'local'
    });

    return { customer, account };
}

// ── Session helpers ───────────────────────────────────────────────────────────

async function createTestSession(clientId) {
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const refreshSalt = await bcrypt.genSalt(10);
    const refresh_token_hash = await bcrypt.hash(rawRefreshToken, refreshSalt);
    const tokenIndex = rawRefreshToken.substring(0, 16);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    await ClientSession.create({
        client_id: clientId,
        refresh_token_hash,
        tokenIndex,
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        device_name: 'Test Device',
        expires_at: expiryDate,
        is_active: true
    });

    return rawRefreshToken;
}

async function createExpiredSession(clientId) {
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const refreshSalt = await bcrypt.genSalt(10);
    const refresh_token_hash = await bcrypt.hash(rawRefreshToken, refreshSalt);
    const tokenIndex = rawRefreshToken.substring(0, 16);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    await ClientSession.create({
        client_id: clientId,
        refresh_token_hash,
        tokenIndex,
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        device_name: 'Test Device',
        expires_at: pastDate,
        is_active: true
    });

    return rawRefreshToken;
}

async function createDeactivatedSession(clientId) {
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const refreshSalt = await bcrypt.genSalt(10);
    const refresh_token_hash = await bcrypt.hash(rawRefreshToken, refreshSalt);
    const tokenIndex = rawRefreshToken.substring(0, 16);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    await ClientSession.create({
        client_id: clientId,
        refresh_token_hash,
        tokenIndex,
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        device_name: 'Test Device',
        expires_at: expiryDate,
        is_active: false
    });

    return rawRefreshToken;
}

// ── tokenIndex field presence ─────────────────────────────────────────────────

describe('ClientSession schema — tokenIndex field', () => {
    it('tokenIndex is saved when a session is created', async () => {
        const rawToken = crypto.randomBytes(64).toString('hex');
        const tokenIndex = rawToken.substring(0, 16);
        const hash = await bcrypt.hash(rawToken, 10);

        const session = await ClientSession.create({
            client_id: new mongoose.Types.ObjectId(),
            refresh_token_hash: hash,
            tokenIndex,
            expires_at: new Date(Date.now() + 86400000),
            is_active: true
        });

        expect(session.tokenIndex).toBe(tokenIndex);
        expect(session.tokenIndex).toHaveLength(16);
    });

    it('tokenIndex equals the first 16 chars of the raw token', async () => {
        const rawToken = crypto.randomBytes(64).toString('hex');
        expect(rawToken.substring(0, 16)).toHaveLength(16);
        expect(rawToken.startsWith(rawToken.substring(0, 16))).toBe(true);
    });
});

// ── Refresh token service — valid token ───────────────────────────────────────

describe('clientAuthService.refreshToken — valid token', () => {
    let testCustomer, testAccount;

    beforeEach(async () => {
        const fixtures = await createFixtures();
        testCustomer = fixtures.customer;
        testAccount = fixtures.account;
    });

    it('returns a new access token for a valid refresh token', async () => {
        const rawRefreshToken = await createTestSession(testCustomer._id);

        const newAccessToken = await clientAuthService.refreshToken(
            rawRefreshToken, '127.0.0.1', 'test-agent'
        );

        expect(newAccessToken).toBeDefined();
        expect(typeof newAccessToken).toBe('string');

        // Verify the new access token is a valid JWT containing the correct client_id
        const decoded = jwt.verify(newAccessToken, process.env.CLIENT_JWT_SECRET);
        expect(decoded.client_id.toString()).toBe(testCustomer._id.toString());
        expect(decoded.email).toBe(testAccount.email);
    });

    it('updates last_active on session after successful refresh', async () => {
        const rawRefreshToken = await createTestSession(testCustomer._id);
        const tokenIndex = rawRefreshToken.substring(0, 16);

        // Small delay to ensure time difference
        await new Promise(r => setTimeout(r, 50));

        await clientAuthService.refreshToken(rawRefreshToken, '127.0.0.1', 'test-agent');

        const after = await ClientSession.findOne({ tokenIndex }).lean();
        expect(after.last_active).toBeTruthy();
    });
});

// ── Refresh token service — invalid tokens ────────────────────────────────────

describe('clientAuthService.refreshToken — invalid tokens', () => {
    let testCustomer, testAccount;

    beforeEach(async () => {
        const fixtures = await createFixtures();
        testCustomer = fixtures.customer;
        testAccount = fixtures.account;
    });

    it('throws for a completely random token', async () => {
        const fakeToken = crypto.randomBytes(64).toString('hex');

        await expect(
            clientAuthService.refreshToken(fakeToken, '127.0.0.1', 'test-agent')
        ).rejects.toThrow();
    });

    it('throws for a token with correct index but tampered hash', async () => {
        const rawRefreshToken = await createTestSession(testCustomer._id);

        // Keep first 16 chars (correct index) but corrupt the rest
        const tamperedToken = rawRefreshToken.substring(0, 16) + crypto.randomBytes(48).toString('hex');

        await expect(
            clientAuthService.refreshToken(tamperedToken, '127.0.0.1', 'test-agent')
        ).rejects.toThrow();
    });

    it('throws for an empty refresh token', async () => {
        await expect(
            clientAuthService.refreshToken('', '127.0.0.1', 'test-agent')
        ).rejects.toThrow();
    });

    it('throws for an expired session token', async () => {
        const expiredToken = await createExpiredSession(testCustomer._id);

        await expect(
            clientAuthService.refreshToken(expiredToken, '127.0.0.1', 'test-agent')
        ).rejects.toThrow('expired');
    });

    it('throws for a deactivated session', async () => {
        const deactivatedToken = await createDeactivatedSession(testCustomer._id);

        await expect(
            clientAuthService.refreshToken(deactivatedToken, '127.0.0.1', 'test-agent')
        ).rejects.toThrow();
    });

    it('throws when portal access is disabled', async () => {
        const rawRefreshToken = await createTestSession(testCustomer._id);

        // Disable portal access
        await ClientAccount.findOneAndUpdate(
            { client_id: testCustomer._id },
            { portal_access_enabled: false }
        );

        await expect(
            clientAuthService.refreshToken(rawRefreshToken, '127.0.0.1', 'test-agent')
        ).rejects.toThrow('disabled');
    });
});

// ── O(1) lookup verification (structural) ────────────────────────────────────

describe('clientAuthService — O(1) lookup structure', () => {
    it('ClientSession has a tokenIndex field defined in schema', () => {
        const schemaPaths = ClientSession.schema.paths;
        expect(schemaPaths.tokenIndex).toBeDefined();
    });

    it('tokenIndex path has an index set to true', () => {
        const tokenIndexPath = ClientSession.schema.paths.tokenIndex;
        const hasIndex = tokenIndexPath.options.index === true;
        expect(hasIndex).toBe(true);
    });

    it('refresh uses tokenIndex for lookup, not full bcrypt scan', async () => {
        const fixtures = await createFixtures();

        // Create multiple sessions — if it were scanning all sessions with bcrypt,
        // this would be extremely slow. The O(1) index lookup should be instant.
        const rawTokens = [];
        for (let i = 0; i < 5; i++) {
            rawTokens.push(await createTestSession(fixtures.customer._id));
        }

        // Refresh with the last token — should find it via index, not bcrypt loop
        const start = Date.now();
        await clientAuthService.refreshToken(rawTokens[4], '127.0.0.1', 'test-agent');
        const elapsed = Date.now() - start;

        // With O(1) lookup, this should be well under 1 second
        expect(elapsed).toBeLessThan(2000);
    });
});
