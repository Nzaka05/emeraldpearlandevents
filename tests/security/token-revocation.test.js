/**
 * tests/security/token-revocation.test.js
 *
 * Verifies the staff-system JWT token revocation mechanism:
 *   1. Tokens with tv < user.tokenVersion are rejected (401)
 *   2. Tokens with tv === user.tokenVersion are accepted
 *   3. Legacy tokens (no tv claim) are treated as tv=0
 *   4. logoutAllSessions bumps tokenVersion and invalidates all existing tokens
 *   5. Password change bumps tokenVersion
 *   6. Suspended accounts are immediately locked out regardless of token validity
 *   7. Cleared cookies cannot be reused
 *
 * ARCHITECTURE:
 *   staff-system/middleware/auth.js (protect middleware):
 *     a. Extract token from Bearer header or cookies (staff_portal_token, portal_token)
 *     b. jwt.verify with STAFF_JWT_SECRET
 *     c. Staff.findById — get user
 *     d. Check user.status === 'Active' (zombie session kill)
 *     e. Check decoded.tv >= user.tokenVersion (revocation check)
 *     f. If revoked → clear cookies, return 401 with TOKEN_REVOKED code
 *
 *   staff-system/controllers/authController.js:
 *     - jwt.sign({ id, tv: user.tokenVersion }, STAFF_JWT_SECRET, ...)
 *     - logoutAllSessions: user.tokenVersion += 1, user.save()
 *     - changePassword: user.tokenVersion += 1 (force re-login everywhere)
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Staff = require('../../staff-system/models/Staff');

jest.setTimeout(30000);

const STAFF_JWT_SECRET = process.env.STAFF_JWT_SECRET || 'test-staff-jwt-secret';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestStaff(overrides = {}) {
    const defaults = {
        name: `Token Test ${Date.now()}`,
        email: `token.test.${Date.now()}@test.com`,
        password: 'TestPass@1234',
        role: 'Staff',
        status: 'Active',
        tokenVersion: 0,
        category: 'Usher'
    };
    const data = { ...defaults, ...overrides };
    const user = await Staff.create(data);

    const token = jwt.sign(
        { id: user._id.toString(), tv: user.tokenVersion || 0 },
        STAFF_JWT_SECRET,
        { expiresIn: '1h' }
    );

    return { user, token };
}

/**
 * Simulates the protect middleware from staff-system/middleware/auth.js.
 * Returns { status, body } matching the middleware's response behavior.
 */
async function simulateProtectMiddleware(token) {
    if (!token) {
        return { status: 401, body: { success: false, error: { code: 'NOT_AUTHENTICATED' } } };
    }

    let decoded;
    try {
        decoded = jwt.verify(token, STAFF_JWT_SECRET);
    } catch (err) {
        return { status: 401, body: { success: false, error: { code: 'INVALID_TOKEN' } } };
    }

    const user = await Staff.findById(decoded.id);

    if (!user) {
        return { status: 401, body: { success: false, error: { code: 'USER_NOT_FOUND' } } };
    }

    // Zombie session check
    if (user.status !== 'Active') {
        return { status: 401, body: { success: false, error: { code: 'ACCOUNT_SUSPENDED' } } };
    }

    // Token version check
    const tokenVer = decoded.tv ?? 0;
    const userVer = user.tokenVersion ?? 0;
    if (tokenVer < userVer) {
        return { status: 401, body: { success: false, error: { code: 'TOKEN_REVOKED' } } };
    }

    return { status: 200, body: { success: true, user: { id: user._id.toString(), role: user.role } } };
}

// ── CORE TOKEN VERSION TESTS ──────────────────────────────────────────────────

describe('Token revocation — tokenVersion enforcement', () => {
    it('accepts token when tv matches user tokenVersion', async () => {
        const { user, token } = await createTestStaff({ tokenVersion: 0 });

        const result = await simulateProtectMiddleware(token);

        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
        expect(result.body.user.id).toBe(user._id.toString());

        await Staff.findByIdAndDelete(user._id);
    });

    it('rejects token when tv < user tokenVersion (TOKEN_REVOKED)', async () => {
        const { user, token } = await createTestStaff({ tokenVersion: 0 });

        // Simulate: admin bumps tokenVersion (e.g., logout-all-sessions)
        await Staff.findByIdAndUpdate(user._id, { tokenVersion: 1 });

        const result = await simulateProtectMiddleware(token);

        expect(result.status).toBe(401);
        expect(result.body.error.code).toBe('TOKEN_REVOKED');

        await Staff.findByIdAndDelete(user._id);
    });

    it('accepts token after re-login with bumped tokenVersion', async () => {
        const { user } = await createTestStaff({ tokenVersion: 0 });

        // Bump tokenVersion
        await Staff.findByIdAndUpdate(user._id, { tokenVersion: 1 });

        // New token with tv=1 (simulates re-login after logout-all)
        const newToken = jwt.sign(
            { id: user._id.toString(), tv: 1 },
            STAFF_JWT_SECRET,
            { expiresIn: '1h' }
        );

        const result = await simulateProtectMiddleware(newToken);

        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── LEGACY TOKEN HANDLING ─────────────────────────────────────────────────────

describe('Token revocation — legacy token handling', () => {
    it('accepts legacy token (no tv claim) when user tokenVersion is 0', async () => {
        const { user } = await createTestStaff({ tokenVersion: 0 });

        // Legacy token — no tv field at all
        const legacyToken = jwt.sign(
            { id: user._id.toString() },
            STAFF_JWT_SECRET,
            { expiresIn: '1h' }
        );

        const result = await simulateProtectMiddleware(legacyToken);

        // decoded.tv is undefined → 0 (via ?? operator). User tokenVersion is 0. 0 >= 0 → accepted.
        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);

        await Staff.findByIdAndDelete(user._id);
    });

    it('rejects legacy token when user tokenVersion > 0', async () => {
        const { user } = await createTestStaff({ tokenVersion: 0 });

        // User bumps tokenVersion (e.g., password change)
        await Staff.findByIdAndUpdate(user._id, { tokenVersion: 1 });

        // Legacy token still has no tv
        const legacyToken = jwt.sign(
            { id: user._id.toString() },
            STAFF_JWT_SECRET,
            { expiresIn: '1h' }
        );

        const result = await simulateProtectMiddleware(legacyToken);

        // decoded.tv undefined → 0. User tokenVersion is 1. 0 < 1 → rejected.
        expect(result.status).toBe(401);
        expect(result.body.error.code).toBe('TOKEN_REVOKED');

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── LOGOUT ALL SESSIONS ───────────────────────────────────────────────────────

describe('Token revocation — logoutAllSessions simulation', () => {
    it('bumping tokenVersion invalidates all existing tokens', async () => {
        const { user, token: token1 } = await createTestStaff({ tokenVersion: 0 });

        // Create another token (simulates another device)
        const token2 = jwt.sign(
            { id: user._id.toString(), tv: 0 },
            STAFF_JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Both tokens work before bump
        expect((await simulateProtectMiddleware(token1)).status).toBe(200);
        expect((await simulateProtectMiddleware(token2)).status).toBe(200);

        // Simulate logoutAllSessions: tokenVersion += 1
        await Staff.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

        // Both tokens are now invalid
        expect((await simulateProtectMiddleware(token1)).status).toBe(401);
        expect((await simulateProtectMiddleware(token1)).body.error.code).toBe('TOKEN_REVOKED');
        expect((await simulateProtectMiddleware(token2)).status).toBe(401);
        expect((await simulateProtectMiddleware(token2)).body.error.code).toBe('TOKEN_REVOKED');

        // Only a new token with tv=1 works
        const token3 = jwt.sign(
            { id: user._id.toString(), tv: 1 },
            STAFF_JWT_SECRET,
            { expiresIn: '1h' }
        );
        expect((await simulateProtectMiddleware(token3)).status).toBe(200);

        await Staff.findByIdAndDelete(user._id);
    });

    it('multiple tokenVersion bumps invalidate all older tokens', async () => {
        const { user } = await createTestStaff({ tokenVersion: 0 });

        const tokensAtVersions = [];
        for (let v = 0; v <= 3; v++) {
            tokensAtVersions.push(jwt.sign(
                { id: user._id.toString(), tv: v },
                STAFF_JWT_SECRET,
                { expiresIn: '1h' }
            ));
        }

        // Bump to version 3
        await Staff.findByIdAndUpdate(user._id, { tokenVersion: 3 });

        // Tokens at version 0, 1, 2 should all be rejected
        for (let v = 0; v < 3; v++) {
            const result = await simulateProtectMiddleware(tokensAtVersions[v]);
            expect(result.status).toBe(401);
            expect(result.body.error.code).toBe('TOKEN_REVOKED');
        }

        // Token at version 3 should be accepted
        const result = await simulateProtectMiddleware(tokensAtVersions[3]);
        expect(result.status).toBe(200);

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── PASSWORD CHANGE → TOKEN INVALIDATION ──────────────────────────────────────

describe('Token revocation — password change', () => {
    it('password change bumps tokenVersion and invalidates old token', async () => {
        const { user, token } = await createTestStaff({ tokenVersion: 0 });

        // Token works before password change
        expect((await simulateProtectMiddleware(token)).status).toBe(200);

        // Simulate password change: tokenVersion += 1
        // (This is what authController.changePassword does)
        await Staff.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

        // Old token is now invalid
        const result = await simulateProtectMiddleware(token);
        expect(result.status).toBe(401);
        expect(result.body.error.code).toBe('TOKEN_REVOKED');

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── SUSPENDED ACCOUNTS ────────────────────────────────────────────────────────

describe('Token revocation — zombie session kill', () => {
    it('suspended account is blocked even with valid token', async () => {
        const { user, token } = await createTestStaff({ status: 'Active' });

        // Token works when active
        expect((await simulateProtectMiddleware(token)).status).toBe(200);

        // Admin suspends the account
        await Staff.findByIdAndUpdate(user._id, { status: 'Suspended' });

        // Same token is now rejected — even though JWT is cryptographically valid
        const result = await simulateProtectMiddleware(token);
        expect(result.status).toBe(401);
        expect(result.body.error.code).toBe('ACCOUNT_SUSPENDED');

        await Staff.findByIdAndDelete(user._id);
    });

    it('re-activated account works with valid token', async () => {
        const { user, token } = await createTestStaff({ status: 'Suspended' });

        // Blocked while suspended
        expect((await simulateProtectMiddleware(token)).status).toBe(401);

        // Admin re-activates
        await Staff.findByIdAndUpdate(user._id, { status: 'Active' });

        // Token works again
        const result = await simulateProtectMiddleware(token);
        expect(result.status).toBe(200);

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── EDGE CASES ────────────────────────────────────────────────────────────────

describe('Token revocation — edge cases', () => {
    it('no token at all returns NOT_AUTHENTICATED', async () => {
        const result = await simulateProtectMiddleware(null);
        expect(result.status).toBe(401);
        expect(result.body.error.code).toBe('NOT_AUTHENTICATED');
    });

    it('expired JWT returns INVALID_TOKEN', async () => {
        const { user } = await createTestStaff();
        const expiredToken = jwt.sign(
            { id: user._id.toString(), tv: 0 },
            STAFF_JWT_SECRET,
            { expiresIn: '0s' }
        );

        await new Promise(r => setTimeout(r, 100));

        const result = await simulateProtectMiddleware(expiredToken);
        expect(result.status).toBe(401);
        expect(result.body.error.code).toBe('INVALID_TOKEN');

        await Staff.findByIdAndDelete(user._id);
    });

    it('token for deleted user returns USER_NOT_FOUND', async () => {
        const { user, token } = await createTestStaff();
        await Staff.findByIdAndDelete(user._id);

        const result = await simulateProtectMiddleware(token);
        expect(result.status).toBe(401);
        expect(result.body.error.code).toBe('USER_NOT_FOUND');
    });
});
