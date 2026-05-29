/**
 * tests/observability/audit-log.test.js — SystemAuditLog + createAuditLog tests
 *
 * Validates:
 *   - Audit entries persist to MongoDB with correct fields
 *   - TTL (90-day expiry) is correctly indexed
 *   - Fire-and-forget: createAuditLog returns before DB write completes
 *   - Fails silently when SystemAuditLog.create throws
 *   - Category-specific severity defaults
 *   - correlationId propagation
 */

const mongoose = require('mongoose');
const SystemAuditLog = require('../../server/models/SystemAuditLog');
const { createAuditLog } = require('../../server/middleware/auditLog');

describe('SystemAuditLog Model', () => {
    beforeEach(async () => {
        await SystemAuditLog.deleteMany({});
    });

    describe('schema and indexes', () => {
        it('persists a document with all required fields', async () => {
            const doc = await SystemAuditLog.create({
                category: 'auth',
                action: 'LOGIN_SUCCESS',
                severity: 'low',
                correlationId: 'test-corr-123',
                ip: '127.0.0.1',
                userAgent: 'Jest/1.0',
            });

            expect(doc._id).toBeDefined();
            expect(doc.timestamp).toBeInstanceOf(Date);
            expect(doc.category).toBe('auth');
            expect(doc.action).toBe('LOGIN_SUCCESS');
            expect(doc.severity).toBe('low');
            expect(doc.correlationId).toBe('test-corr-123');
        });

        it('defaults severity to "low" for auth category', async () => {
            const doc = await SystemAuditLog.create({
                category: 'auth',
                action: 'LOGOUT',
            });
            expect(doc.severity).toBe('low');
        });

        it('accepts severity "high" for financial category', async () => {
            const doc = await SystemAuditLog.create({
                category: 'financial',
                action: 'PAYMENT_PROCESSED',
                severity: 'high',
            });
            expect(doc.severity).toBe('high');
        });

        it('accepts severity "critical" for security category', async () => {
            const doc = await SystemAuditLog.create({
                category: 'security',
                action: 'HMAC_FAILURE',
                severity: 'critical',
            });
            expect(doc.severity).toBe('critical');
        });

        it('rejects invalid category values', async () => {
            await expect(
                SystemAuditLog.create({ category: 'invalid', action: 'TEST' })
            ).rejects.toThrow();
        });

        it('requires action field', async () => {
            await expect(
                SystemAuditLog.create({ category: 'auth' })
            ).rejects.toThrow();
        });

        it('stores metadata as Mixed type', async () => {
            const doc = await SystemAuditLog.create({
                category: 'admin',
                action: 'BOOKING_MODIFIED',
                metadata: { bookingRef: 'BK-001', changes: ['status'] },
            });
            expect(doc.metadata.bookingRef).toBe('BK-001');
            expect(doc.metadata.changes).toEqual(['status']);
        });

        it('has TTL index on timestamp (90 days = 7776000 seconds)', () => {
            // Verify the schema-level index definition — runtime indexes
            // may conflict in MongoMemoryServer when multiple tests share
            // the same collection with different index builds.
            const schemaIndexes = SystemAuditLog.schema.indexes();
            const ttlIndex = schemaIndexes.find(
                ([fields, options]) =>
                    fields.timestamp === 1 && options?.expireAfterSeconds === 7776000
            );
            expect(ttlIndex).toBeDefined();
            expect(ttlIndex[1].expireAfterSeconds).toBe(7776000);
        });
    });
});

describe('createAuditLog middleware', () => {
    beforeEach(async () => {
        await SystemAuditLog.deleteMany({});
    });

    it('persists an audit document to MongoDB', async () => {
        const mockReq = {
            headers: { 'x-forwarded-for': '10.0.0.1', 'user-agent': 'TestAgent' },
            user: { _id: new mongoose.Types.ObjectId() },
            res: { locals: { correlationId: 'corr-001' } },
            connection: { remoteAddress: '127.0.0.1' },
        };

        createAuditLog('auth', 'LOGIN_SUCCESS', mockReq, {
            metadata: { provider: 'local' },
        });

        // Wait for fire-and-forget to complete
        await new Promise(r => setTimeout(r, 200));

        const docs = await SystemAuditLog.find({});
        expect(docs).toHaveLength(1);
        expect(docs[0].category).toBe('auth');
        expect(docs[0].action).toBe('LOGIN_SUCCESS');
        expect(docs[0].ip).toBe('10.0.0.1');
        expect(docs[0].userAgent).toBe('TestAgent');
        expect(docs[0].correlationId).toBe('corr-001');
        expect(docs[0].metadata.provider).toBe('local');
    });

    it('document has all required fields', async () => {
        createAuditLog('financial', 'PAYMENT_PROCESSED', null, {
            severity: 'high',
            correlationId: 'corr-fin-001',
        });

        await new Promise(r => setTimeout(r, 200));

        const doc = await SystemAuditLog.findOne({ action: 'PAYMENT_PROCESSED' });
        expect(doc).toBeDefined();
        expect(doc.timestamp).toBeInstanceOf(Date);
        expect(doc.category).toBe('financial');
        expect(doc.action).toBe('PAYMENT_PROCESSED');
        expect(doc.severity).toBe('high');
        expect(doc.correlationId).toBe('corr-fin-001');
    });

    it('returns before DB write completes (fire-and-forget)', () => {
        const spy = jest.spyOn(SystemAuditLog, 'create');

        // createAuditLog is synchronous (fire-and-forget) — should return immediately
        const start = Date.now();
        createAuditLog('auth', 'TOKEN_REVOKED', null, {});
        const elapsed = Date.now() - start;

        // Should return nearly instantly (< 50ms) — not waiting for DB
        expect(elapsed).toBeLessThan(50);
        expect(spy).toHaveBeenCalled();

        spy.mockRestore();
    });

    it('fails silently when SystemAuditLog.create throws', async () => {
        const spy = jest.spyOn(SystemAuditLog, 'create').mockRejectedValueOnce(
            new Error('DB connection lost')
        );

        // Should NOT throw
        expect(() => {
            createAuditLog('auth', 'LOGIN_FAILURE', null, {});
        }).not.toThrow();

        // Wait for the rejected promise to be caught
        await new Promise(r => setTimeout(r, 200));

        spy.mockRestore();
    });

    it('extracts userId from req.user._id', async () => {
        const userId = new mongoose.Types.ObjectId();
        const mockReq = {
            user: { _id: userId },
            headers: {},
            connection: {},
            res: { locals: {} },
        };

        createAuditLog('auth', 'REFRESH_TOKEN_USED', mockReq);

        await new Promise(r => setTimeout(r, 200));

        const doc = await SystemAuditLog.findOne({ action: 'REFRESH_TOKEN_USED' });
        expect(doc.userId.toString()).toBe(userId.toString());
    });

    it('extracts userId from req.admin.adminId when req.user is absent', async () => {
        const adminId = new mongoose.Types.ObjectId();
        const mockReq = {
            admin: { adminId },
            headers: {},
            connection: {},
            res: { locals: {} },
        };

        createAuditLog('admin', 'ADMIN_LOGIN', mockReq);

        await new Promise(r => setTimeout(r, 200));

        const doc = await SystemAuditLog.findOne({ action: 'ADMIN_LOGIN' });
        expect(doc.userId.toString()).toBe(adminId.toString());
    });

    it('propagates correlationId from options', async () => {
        createAuditLog('security', 'HMAC_FAILURE', null, {
            severity: 'critical',
            correlationId: 'corr-sec-999',
        });

        await new Promise(r => setTimeout(r, 200));

        const doc = await SystemAuditLog.findOne({ action: 'HMAC_FAILURE' });
        expect(doc.correlationId).toBe('corr-sec-999');
        expect(doc.severity).toBe('critical');
    });
});
