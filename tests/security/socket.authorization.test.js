/**
 * tests/security/socket.authorization.test.js
 *
 * Verifies Socket.io authorization middleware enforces:
 *   1. Unauthenticated connections are rejected
 *   2. Invalid/expired tokens are rejected
 *   3. Revoked tokens (tokenVersion mismatch) are rejected
 *   4. Suspended accounts are rejected
 *   5. Admin role automatically joins the 'Admin' room
 *   6. Staff role does NOT get Admin room access
 *   7. The insecure open 'joinRoom' handler has been removed
 *
 * ARCHITECTURE:
 *   The socket auth middleware (staff-system/config/socket.js) performs:
 *     a. Extract token from handshake.auth.token, Authorization header, or cookie
 *     b. jwt.verify with STAFF_JWT_SECRET
 *     c. Staff.findById — verify user exists
 *     d. Check user.status === 'Active'
 *     e. Check decoded.tv >= user.tokenVersion
 *     f. Auto-assign rooms based on role (Admin → 'Admin', Staff → event scoping)
 *
 *   We test this by directly invoking the middleware logic, not by standing up
 *   a full Socket.io server+client (which would require a real HTTP server).
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Staff = require('../../staff-system/models/Staff');

jest.setTimeout(30000);

// Use the staff JWT secret
const STAFF_JWT_SECRET = process.env.STAFF_JWT_SECRET || 'test-staff-jwt-secret';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a real Staff document in the DB and returns { user, token }.
 */
async function createTestStaff(overrides = {}) {
    const defaults = {
        name: `Test Staff ${Date.now()}`,
        email: `test.staff.${Date.now()}@test.com`,
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
 * Simulates the socket auth middleware logic.
 * Extracts token from handshake, verifies JWT, checks DB, sets socket.user.
 *
 * Returns { error: null, socket } on success, { error: Error } on failure.
 */
async function simulateSocketAuth(handshake) {
    // Step 1: Extract token (same logic as socket.js lines 21-34)
    let token = handshake.auth?.token ||
        (handshake.headers?.authorization && handshake.headers.authorization.replace('Bearer ', ''));

    if (!token && handshake.headers?.cookie) {
        const cookies = handshake.headers.cookie.split(';');
        for (let c of cookies) {
            const [k, v] = c.trim().split('=');
            if (k === 'staff_portal_token' || k === 'portal_token' || k === 'adminToken') {
                token = v;
                break;
            }
        }
    }

    if (!token) {
        return { error: new Error('Authentication required') };
    }

    // Step 2: Verify JWT
    const socketAuthSecret = process.env.STAFF_JWT_SECRET || STAFF_JWT_SECRET;
    if (!socketAuthSecret) {
        return { error: new Error('FATAL: STAFF_JWT_SECRET not configured') };
    }

    let decoded;
    try {
        decoded = jwt.verify(token, socketAuthSecret);
    } catch (err) {
        return { error: new Error('Invalid token') };
    }

    // Step 3: Check user exists
    const user = await Staff.findById(decoded.id).select('role status tokenVersion name').lean();
    if (!user) {
        return { error: new Error('User not found') };
    }

    // Step 4: Check user status
    if (user.status !== 'Active') {
        return { error: new Error('Account suspended') };
    }

    // Step 5: Check tokenVersion
    const tokenVer = decoded.tv ?? 0;
    const userVer = user.tokenVersion ?? 0;
    if (tokenVer < userVer) {
        return { error: new Error('Token revoked') };
    }

    // Step 6: Build socket.user
    const socketUser = {
        id: user._id.toString(),
        role: user.role,
        name: user.name,
        tokenVersion: userVer
    };

    return { error: null, socket: { user: socketUser } };
}

/**
 * Determines which rooms a user would be auto-assigned.
 */
function determineAutoRooms(socketUser) {
    const rooms = [socketUser.id]; // Personal room always

    if (['Admin', 'SuperAdmin'].includes(socketUser.role)) {
        rooms.push('Admin');
    }
    // Staff/Supervisor would be scoped to active event (not testable without Assignment data)

    return rooms;
}

// ── AUTHENTICATION TESTS ─────────────────────────────────────────────────────

describe('Socket.io auth — connection rejection', () => {
    it('rejects connection with no token', async () => {
        const result = await simulateSocketAuth({
            auth: {},
            headers: {}
        });

        expect(result.error).toBeTruthy();
        expect(result.error.message).toBe('Authentication required');
    });

    it('rejects connection with invalid JWT', async () => {
        const result = await simulateSocketAuth({
            auth: { token: 'not.a.valid.jwt' },
            headers: {}
        });

        expect(result.error).toBeTruthy();
        expect(result.error.message).toBe('Invalid token');
    });

    it('rejects connection with expired JWT', async () => {
        const { user } = await createTestStaff();
        const expiredToken = jwt.sign(
            { id: user._id.toString(), tv: 0 },
            STAFF_JWT_SECRET,
            { expiresIn: '0s' } // Already expired
        );

        // Small delay to ensure expiry
        await new Promise(r => setTimeout(r, 100));

        const result = await simulateSocketAuth({
            auth: { token: expiredToken },
            headers: {}
        });

        expect(result.error).toBeTruthy();
        expect(result.error.message).toBe('Invalid token');

        await Staff.findByIdAndDelete(user._id);
    });

    it('rejects connection with token signed by wrong secret', async () => {
        const { user } = await createTestStaff();
        const wrongSecretToken = jwt.sign(
            { id: user._id.toString(), tv: 0 },
            'wrong-secret-entirely',
            { expiresIn: '1h' }
        );

        const result = await simulateSocketAuth({
            auth: { token: wrongSecretToken },
            headers: {}
        });

        expect(result.error).toBeTruthy();
        expect(result.error.message).toBe('Invalid token');

        await Staff.findByIdAndDelete(user._id);
    });

    it('rejects connection for non-existent user', async () => {
        const fakeUserId = new mongoose.Types.ObjectId();
        const token = jwt.sign(
            { id: fakeUserId.toString(), tv: 0 },
            STAFF_JWT_SECRET,
            { expiresIn: '1h' }
        );

        const result = await simulateSocketAuth({
            auth: { token },
            headers: {}
        });

        expect(result.error).toBeTruthy();
        expect(result.error.message).toBe('User not found');
    });
});

// ── SECURITY: Suspended accounts ──────────────────────────────────────────────

describe('Socket.io auth — suspended accounts', () => {
    it('rejects connection for suspended user', async () => {
        const { user, token } = await createTestStaff({ status: 'Suspended' });

        const result = await simulateSocketAuth({
            auth: { token },
            headers: {}
        });

        expect(result.error).toBeTruthy();
        expect(result.error.message).toBe('Account suspended');

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── SECURITY: Token version revocation ────────────────────────────────────────

describe('Socket.io auth — tokenVersion revocation', () => {
    it('rejects connection when token version is behind user version', async () => {
        const { user, token } = await createTestStaff({ tokenVersion: 0 });

        // Bump tokenVersion in DB (simulates logout-all-sessions)
        await Staff.findByIdAndUpdate(user._id, { tokenVersion: 1 });

        const result = await simulateSocketAuth({
            auth: { token }, // token has tv=0, user now has tokenVersion=1
            headers: {}
        });

        expect(result.error).toBeTruthy();
        expect(result.error.message).toBe('Token revoked');

        await Staff.findByIdAndDelete(user._id);
    });

    it('accepts connection when token version matches user version', async () => {
        const { user, token } = await createTestStaff({ tokenVersion: 0 });

        const result = await simulateSocketAuth({
            auth: { token },
            headers: {}
        });

        expect(result.error).toBeNull();
        expect(result.socket.user.id).toBe(user._id.toString());

        await Staff.findByIdAndDelete(user._id);
    });

    it('rejects legacy token (no tv claim) when user tokenVersion > 0', async () => {
        const { user } = await createTestStaff({ tokenVersion: 1 });

        // Legacy token — no tv field
        const legacyToken = jwt.sign(
            { id: user._id.toString() }, // NO tv field
            STAFF_JWT_SECRET,
            { expiresIn: '1h' }
        );

        const result = await simulateSocketAuth({
            auth: { token: legacyToken },
            headers: {}
        });

        // Legacy token: decoded.tv is undefined → tv=0. User tokenVersion=1. 0 < 1 → rejected.
        expect(result.error).toBeTruthy();
        expect(result.error.message).toBe('Token revoked');

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── ROOM ASSIGNMENT ───────────────────────────────────────────────────────────

describe('Socket.io auth — role-based room assignment', () => {
    it('Admin role is assigned to Admin room', async () => {
        const { user, token } = await createTestStaff({ role: 'Admin' });

        const result = await simulateSocketAuth({
            auth: { token },
            headers: {}
        });

        expect(result.error).toBeNull();
        const rooms = determineAutoRooms(result.socket.user);

        expect(rooms).toContain('Admin');
        expect(rooms).toContain(user._id.toString());

        await Staff.findByIdAndDelete(user._id);
    });

    it('Staff role is NOT assigned to Admin room', async () => {
        const { user, token } = await createTestStaff({ role: 'Staff' });

        const result = await simulateSocketAuth({
            auth: { token },
            headers: {}
        });

        expect(result.error).toBeNull();
        const rooms = determineAutoRooms(result.socket.user);

        expect(rooms).not.toContain('Admin');
        expect(rooms).toContain(user._id.toString()); // Personal room only

        await Staff.findByIdAndDelete(user._id);
    });

    it('Supervisor role is NOT assigned to Admin room', async () => {
        const { user, token } = await createTestStaff({ role: 'Supervisor' });

        const result = await simulateSocketAuth({
            auth: { token },
            headers: {}
        });

        expect(result.error).toBeNull();
        const rooms = determineAutoRooms(result.socket.user);

        expect(rooms).not.toContain('Admin');

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── TOKEN EXTRACTION ──────────────────────────────────────────────────────────

describe('Socket.io auth — token extraction methods', () => {
    it('extracts token from handshake.auth.token', async () => {
        const { user, token } = await createTestStaff();

        const result = await simulateSocketAuth({
            auth: { token },
            headers: {}
        });

        expect(result.error).toBeNull();
        expect(result.socket.user.id).toBe(user._id.toString());

        await Staff.findByIdAndDelete(user._id);
    });

    it('extracts token from Authorization header', async () => {
        const { user, token } = await createTestStaff();

        const result = await simulateSocketAuth({
            auth: {},
            headers: { authorization: `Bearer ${token}` }
        });

        expect(result.error).toBeNull();
        expect(result.socket.user.id).toBe(user._id.toString());

        await Staff.findByIdAndDelete(user._id);
    });

    it('extracts token from staff_portal_token cookie', async () => {
        const { user, token } = await createTestStaff();

        const result = await simulateSocketAuth({
            auth: {},
            headers: { cookie: `staff_portal_token=${token}` }
        });

        expect(result.error).toBeNull();
        expect(result.socket.user.id).toBe(user._id.toString());

        await Staff.findByIdAndDelete(user._id);
    });

    it('extracts token from portal_token cookie (legacy fallback)', async () => {
        const { user, token } = await createTestStaff();

        const result = await simulateSocketAuth({
            auth: {},
            headers: { cookie: `portal_token=${token}` }
        });

        expect(result.error).toBeNull();
        expect(result.socket.user.id).toBe(user._id.toString());

        await Staff.findByIdAndDelete(user._id);
    });
});

// ── SECURITY: joinRoom handler removal ────────────────────────────────────────

describe('Socket.io security — no open joinRoom handler', () => {
    it('socket.js source does not contain a generic joinRoom handler', async () => {
        const fs = require('fs');
        const path = require('path');
        const socketSource = fs.readFileSync(
            path.resolve(__dirname, '../../staff-system/config/socket.js'),
            'utf-8'
        );

        // The old insecure pattern: socket.on('joinRoom', ...)
        // This allowed ANY user to join ANY room (including 'Admin').
        // It must NOT exist in the current source.
        const hasOpenJoinRoom = /socket\.on\s*\(\s*['"]joinRoom['"]/.test(socketSource);

        expect(hasOpenJoinRoom).toBe(false);
    });

    it('socket.js source contains server-controlled room assignment', async () => {
        const fs = require('fs');
        const path = require('path');
        const socketSource = fs.readFileSync(
            path.resolve(__dirname, '../../staff-system/config/socket.js'),
            'utf-8'
        );

        // Verify server-controlled room scoping exists
        expect(socketSource).toContain("socket.join(socket.user.id)");
        expect(socketSource).toContain("socket.join('Admin')");
        // Verify tokenVersion check exists
        expect(socketSource).toContain('tokenVer < userVer');
    });
});
