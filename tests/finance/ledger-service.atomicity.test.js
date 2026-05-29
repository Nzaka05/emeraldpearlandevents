/**
 * tests/finance/ledger-service.atomicity.test.js
 *
 * Verifies financial ledger atomicity guarantees:
 *   1. recordTransaction commits Transaction + ledger $inc atomically
 *   2. When findOneAndUpdate fails, orphan transactions are cleaned up
 *   3. Concurrent writes produce correct totals (no lost updates)
 *   4. History entries are append-only and correctly linked
 *   5. Different transaction types route to correct $inc buckets
 *
 * FIX: Original test spied on EventLedger.prototype.save() to simulate failure,
 *      but the new ledgerService uses `findOneAndUpdate` with `$inc` (never `.save()`).
 *      This rewrite mocks `findOneAndUpdate` to simulate failure and tests the
 *      compensating delete path (non-transactional fallback in standalone MongoDB).
 *
 * ARCHITECTURE:
 *   The ledger service now uses:
 *     - $inc for atomic counter updates (budget, expenses, payroll, etc.)
 *     - $push for append-only history
 *     - findOneAndUpdate for single-operation ledger mutation
 *     - Compensating Transaction.findByIdAndDelete on failure (non-transactional mode)
 */

const crypto = require('crypto');

// CRITICAL: Use the staff-system's own mongoose instance for ObjectId creation.
// The staff-system has its own node_modules/mongoose with a different BSON version.
// Mixing ObjectIds from the root mongoose with staff-system models causes:
//   BSONVersionError: Unsupported BSON version, bson types must be from bson 7.x.x
let staffMongoose;
try {
    staffMongoose = require('../../staff-system/node_modules/mongoose');
} catch (e) {
    // Fallback if staff-system doesn't have its own mongoose
    staffMongoose = require('mongoose');
}

const ledgerService = require('../../staff-system/financials/services/ledgerService');
const EventLedger = require('../../staff-system/models/EventLedger');
const Transaction = require('../../staff-system/models/Transaction');

jest.setTimeout(30000);

// ── Force non-transactional mode ─────────────────────────────────────────────
// MongoMemoryServer runs in standalone mode (not a replica set), which does NOT
// support transactions. The ledgerService tries mongoose.startSession() and
// falls back to non-transactional writes when it fails. We force the fallback
// by making startSession() throw, simulating the standalone environment.
beforeAll(() => {
    jest.spyOn(staffMongoose, 'startSession').mockRejectedValue(
        new Error('Sessions not supported in standalone mode (test env)')
    );
});

afterAll(() => {
    jest.restoreAllMocks();
});

// ── Helper to create a unique event ID for each test ─────────────────────────
function makeEventId() {
    return new staffMongoose.Types.ObjectId();
}

describe('ledgerService atomic writes', () => {
    let eventId;

    beforeEach(async () => {
        eventId = makeEventId();
        await ledgerService.initializeEventLedger(eventId, null, 1000);
    });

    // ── Test 1: Happy path — Transaction + ledger commit together ────────────
    it('commits transaction and ledger updates together', async () => {
        const tx = await ledgerService.recordTransaction({
            event_id: eventId,
            type: 'expense',
            amount: 250,
            direction: 'out',
            description: 'Transport expense'
        });

        expect(tx).toBeTruthy();

        const [storedTx, ledger] = await Promise.all([
            Transaction.findById(tx._id),
            EventLedger.findOne({ eventId })
        ]);

        expect(storedTx).toBeTruthy();
        expect(storedTx.type).toBe('expense');
        expect(storedTx.sourceSystem).toBe('staff-portal');

        expect(ledger).toBeTruthy();
        expect(ledger.totals.budget).toBe(1000);
        expect(ledger.totals.expenses).toBe(250);
        expect(ledger.totals.balance).toBe(750);
        expect(ledger.totals.profit).toBe(750);
        expect(ledger.history).toHaveLength(1);
        expect(String(ledger.history[0].transactionId)).toBe(String(tx._id));
    });

    // ── Test 2: Failure rollback — compensating delete on findOneAndUpdate failure ─
    it('cleans up orphan transaction when ledger update fails (non-transactional)', async () => {
        // Mock findOneAndUpdate to throw AFTER Transaction.create succeeds.
        // In non-transactional mode (standalone MongoDB, as in test env),
        // the service uses a compensating delete to remove the orphan Transaction.
        const originalFindOneAndUpdate = EventLedger.findOneAndUpdate.bind(EventLedger);
        const spy = jest.spyOn(EventLedger, 'findOneAndUpdate')
            .mockImplementationOnce(async function () {
                // First call: the ledgerExists check uses findOne, not findOneAndUpdate.
                // findOneAndUpdate is only called for the $inc operation.
                throw new Error('forced-findOneAndUpdate-failure');
            });

        await expect(
            ledgerService.recordTransaction({
                event_id: eventId,
                type: 'expense',
                amount: 100,
                direction: 'out',
                description: 'Should be cleaned up'
            })
        ).rejects.toThrow('forced-findOneAndUpdate-failure');

        spy.mockRestore();

        // Verify: orphan Transaction was cleaned up (compensating delete)
        const allTx = await Transaction.find({ eventId });
        expect(allTx).toHaveLength(0);

        // Verify: ledger totals remain untouched
        const ledger = await EventLedger.findOne({ eventId });
        expect(ledger.totals.expenses).toBe(0);
        expect(ledger.totals.balance).toBe(1000);
        expect(ledger.history).toHaveLength(0);
    });

    // ── Test 3: Multiple sequential transactions accumulate correctly ─────────
    it('accumulates multiple transactions correctly', async () => {
        await ledgerService.recordTransaction({
            event_id: eventId, type: 'expense', amount: 200, direction: 'out', description: 'Expense 1'
        });
        await ledgerService.recordTransaction({
            event_id: eventId, type: 'expense', amount: 150, direction: 'out', description: 'Expense 2'
        });
        await ledgerService.recordTransaction({
            event_id: eventId, type: 'payroll', amount: 300, direction: 'out', description: 'Staff pay'
        });

        const ledger = await EventLedger.findOne({ eventId });

        expect(ledger.totals.budget).toBe(1000);
        expect(ledger.totals.expenses).toBe(350);    // 200 + 150
        expect(ledger.totals.payroll).toBe(300);
        expect(ledger.totals.balance).toBe(350);      // 1000 - 200 - 150 - 300
        expect(ledger.totals.profit).toBe(350);
        expect(ledger.history).toHaveLength(3);
    });

    // ── Test 4: Client payment (budget in) increases balance ─────────────────
    it('handles clientPayment (direction=in) correctly', async () => {
        const tx = await ledgerService.recordTransaction({
            event_id: eventId,
            type: 'clientPayment',
            amount: 500,
            direction: 'in',
            description: 'Additional client payment'
        });

        const ledger = await EventLedger.findOne({ eventId });

        expect(ledger.totals.budget).toBe(1500);     // 1000 + 500
        expect(ledger.totals.balance).toBe(1500);
        expect(ledger.totals.profit).toBe(1500);
    });

    // ── Test 5: Emergency fund deduction ─────────────────────────────────────
    it('handles emergency fund deduction correctly', async () => {
        await ledgerService.recordTransaction({
            event_id: eventId,
            type: 'emergency_fund',
            amount: 100,
            direction: 'out',
            description: 'Emergency fund disbursement'
        });

        const ledger = await EventLedger.findOne({ eventId });

        expect(ledger.totals.emergency_funds_used).toBe(100);
        expect(ledger.totals.balance).toBe(900);
        expect(ledger.totals.profit).toBe(900);
    });

    // ── Test 6: History entries are append-only with transaction links ────────
    it('appends history entries with correct transaction references', async () => {
        const tx1 = await ledgerService.recordTransaction({
            event_id: eventId, type: 'expense', amount: 100, direction: 'out', description: 'First'
        });
        const tx2 = await ledgerService.recordTransaction({
            event_id: eventId, type: 'expense', amount: 200, direction: 'out', description: 'Second'
        });

        const ledger = await EventLedger.findOne({ eventId });

        expect(ledger.history).toHaveLength(2);
        expect(String(ledger.history[0].transactionId)).toBe(String(tx1._id));
        expect(String(ledger.history[1].transactionId)).toBe(String(tx2._id));
        expect(ledger.history[0].amount).toBe(100);
        expect(ledger.history[1].amount).toBe(200);
        expect(ledger.history[0].description).toBe('First');
        expect(ledger.history[1].description).toBe('Second');
    });

    // ── Test 7: Reject invalid amounts ───────────────────────────────────────
    it('rejects zero or negative amounts', async () => {
        await expect(
            ledgerService.recordTransaction({
                event_id: eventId, type: 'expense', amount: 0, direction: 'out', description: 'Zero'
            })
        ).rejects.toThrow('positive');

        await expect(
            ledgerService.recordTransaction({
                event_id: eventId, type: 'expense', amount: -50, direction: 'out', description: 'Negative'
            })
        ).rejects.toThrow('positive');
    });

    // ── Test 8: Reject invalid direction ─────────────────────────────────────
    it('rejects invalid direction', async () => {
        await expect(
            ledgerService.recordTransaction({
                event_id: eventId, type: 'expense', amount: 100, direction: 'sideways', description: 'Bad direction'
            })
        ).rejects.toThrow('in or out');
    });

    // ── Test 9: Reject transaction on non-existent ledger ────────────────────
    it('rejects transaction on non-existent event ledger', async () => {
        const fakeEventId = new staffMongoose.Types.ObjectId();
        await expect(
            ledgerService.recordTransaction({
                event_id: fakeEventId, type: 'expense', amount: 100, direction: 'out', description: 'No ledger'
            })
        ).rejects.toThrow('Ledger not found');  // Matches: 'Event Ledger not found. Cannot process transaction.'
    });

    // ── Test 10: Duplicate ledger initialization is rejected ─────────────────
    it('rejects duplicate ledger initialization', async () => {
        await expect(
            ledgerService.initializeEventLedger(eventId, null, 2000)
        ).rejects.toThrow('already exists');
    });
});

// ── CONCURRENCY TESTS ────────────────────────────────────────────────────────
// These tests verify the core $inc atomicity guarantee: under parallel writes,
// the final totals must equal the sum of all individual amounts.

describe('ledgerService concurrency — $inc atomicity', () => {
    let eventId;

    beforeEach(async () => {
        eventId = makeEventId();
        await ledgerService.initializeEventLedger(eventId, null, 10000);
    });

    it('concurrent expense writes produce correct totals (no lost updates)', async () => {
        const numConcurrent = 10;
        const amountEach = 100;

        // Fire N parallel expense transactions
        const promises = Array.from({ length: numConcurrent }, (_, i) =>
            ledgerService.recordTransaction({
                event_id: eventId,
                type: 'expense',
                amount: amountEach,
                direction: 'out',
                description: `Concurrent expense ${i + 1}`
            })
        );

        const results = await Promise.all(promises);

        // All N transactions should have been created
        expect(results).toHaveLength(numConcurrent);
        results.forEach(tx => expect(tx).toBeTruthy());

        // Verify final ledger state
        const ledger = await EventLedger.findOne({ eventId });
        const expectedExpenses = numConcurrent * amountEach; // 1000
        const expectedBalance = 10000 - expectedExpenses;     // 9000

        expect(ledger.totals.expenses).toBe(expectedExpenses);
        expect(ledger.totals.balance).toBe(expectedBalance);
        expect(ledger.totals.profit).toBe(expectedBalance);
        expect(ledger.history).toHaveLength(numConcurrent);

        // Verify no duplicate Transaction records
        const txCount = await Transaction.countDocuments({ eventId });
        expect(txCount).toBe(numConcurrent);
    });

    it('mixed concurrent payments and expenses balance correctly', async () => {
        const payments = Array.from({ length: 5 }, (_, i) =>
            ledgerService.recordTransaction({
                event_id: eventId, type: 'clientPayment', amount: 200,
                direction: 'in', description: `Payment ${i + 1}`
            })
        );
        const expenses = Array.from({ length: 5 }, (_, i) =>
            ledgerService.recordTransaction({
                event_id: eventId, type: 'expense', amount: 100,
                direction: 'out', description: `Expense ${i + 1}`
            })
        );

        await Promise.all([...payments, ...expenses]);

        const ledger = await EventLedger.findOne({ eventId });

        // Budget: 10000 (initial) + 5×200 = 11000
        expect(ledger.totals.budget).toBe(11000);
        // Expenses: 5×100 = 500
        expect(ledger.totals.expenses).toBe(500);
        // Balance: 11000 - 500 = 10500
        expect(ledger.totals.balance).toBe(10500);
        expect(ledger.history).toHaveLength(10);
    });
});
