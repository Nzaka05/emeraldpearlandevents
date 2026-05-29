/**
 * tests/finance/payment-state-machine.test.js
 *
 * Verifies the payment state machine enforces strict transitions:
 *   1. All valid transitions succeed
 *   2. Invalid transitions are rejected with descriptive errors
 *   3. Terminal states (Settled) cannot transition to anything
 *   4. No-op transitions (same state) are always valid
 *   5. assertTransition throws on invalid, returns nothing on valid
 *   6. computeAggregateStatus correctly aggregates mixed statuses
 *   7. Unknown states are caught and rejected
 *
 * ARCHITECTURE:
 *   The state machine is a pure function — no DB, no side effects.
 *   Every status change in the payment flow MUST call assertTransition().
 *   This prevents race conditions where a callback could move Settled → Pending.
 */

const {
    validateTransition,
    assertTransition,
    computeAggregateStatus,
    VALID_TRANSITIONS,
    TERMINAL_STATES,
    ALL_STATES
} = require('../../staff-system/financials/utils/paymentStateMachine');

describe('paymentStateMachine — valid transitions', () => {
    const validCases = [
        ['Pending', 'Sent',      'Admin initiates M-Pesa B2C'],
        ['Pending', 'Received',  'Cash payment or manual confirmation'],
        ['Pending', 'Failed',    'B2C initiation error'],
        ['Sent',    'Received',  'Safaricom callback success'],
        ['Sent',    'Failed',    'Safaricom callback failure'],
        ['Failed',  'Pending',   'Admin retries payment'],
        ['Received','Disputed',  'Staff disputes amount'],
        ['Received','Settled',   'Event lifecycle closes'],
        ['Received','Disbursed', 'Payroll service marks disbursed'],
        ['Disputed','Received',  'Admin resolves dispute'],
        ['Disputed','Pending',   'Admin voids and re-initiates'],
        ['Disbursed','Settled',  'Event lifecycle closes'],
    ];

    it.each(validCases)('%s → %s: %s', (from, to) => {
        const result = validateTransition(from, to);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });
});

describe('paymentStateMachine — invalid transitions', () => {
    const invalidCases = [
        ['Pending',   'Settled',   'Cannot skip to terminal'],
        ['Pending',   'Disputed',  'Cannot dispute before receiving'],
        ['Pending',   'Disbursed', 'Cannot disburse from pending'],
        ['Sent',      'Pending',   'Cannot go back from Sent to Pending'],
        ['Sent',      'Settled',   'Cannot skip to terminal from Sent'],
        ['Sent',      'Disputed',  'Cannot dispute before receiving'],
        ['Failed',    'Received',  'Cannot go directly from Failed to Received'],
        ['Failed',    'Settled',   'Cannot settle from failed'],
        ['Received',  'Pending',   'Cannot go back to Pending from Received'],
        ['Received',  'Sent',      'Cannot re-send after receiving'],
        ['Received',  'Failed',    'Cannot fail after receiving'],
        ['Disbursed', 'Pending',   'Cannot go back from Disbursed'],
        ['Disbursed', 'Received',  'Cannot go back from Disbursed'],
    ];

    it.each(invalidCases)('%s → %s: blocked (%s)', (from, to) => {
        const result = validateTransition(from, to);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
    });
});

describe('paymentStateMachine — terminal states', () => {
    it('Settled → any other state is rejected', () => {
        const targetStates = ['Pending', 'Sent', 'Received', 'Failed', 'Disputed', 'Disbursed'];

        for (const to of targetStates) {
            const result = validateTransition('Settled', to);
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/terminal/i);
        }
    });

    it('Settled → Settled is valid (no-op)', () => {
        const result = validateTransition('Settled', 'Settled');
        expect(result.valid).toBe(true);
    });

    it('TERMINAL_STATES set contains Settled', () => {
        expect(TERMINAL_STATES.has('Settled')).toBe(true);
    });
});

describe('paymentStateMachine — no-op transitions', () => {
    it('same state transitions are always valid', () => {
        for (const state of ALL_STATES) {
            const result = validateTransition(state, state);
            expect(result.valid).toBe(true);
        }
    });
});

describe('paymentStateMachine — unknown states', () => {
    it('rejects unknown current state', () => {
        const result = validateTransition('Cancelled', 'Pending');
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/unknown/i);
    });

    it('rejects unknown target state', () => {
        const result = validateTransition('Pending', 'Refunded');
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/unknown/i);
    });

    it('rejects both states unknown', () => {
        const result = validateTransition('Deleted', 'Archived');
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/unknown/i);
    });
});

describe('paymentStateMachine — assertTransition', () => {
    it('does not throw on valid transition', () => {
        expect(() => assertTransition('Pending', 'Sent')).not.toThrow();
    });

    it('throws on invalid transition', () => {
        expect(() => assertTransition('Pending', 'Settled')).toThrow(/Invalid transition/);
    });

    it('throws on terminal state transition', () => {
        expect(() => assertTransition('Settled', 'Pending')).toThrow(/terminal/i);
    });

    it('includes context in error message when provided', () => {
        expect(() => assertTransition('Pending', 'Settled', 'mpesaCallback')).toThrow('[mpesaCallback]');
    });

    it('does not throw on no-op transition', () => {
        expect(() => assertTransition('Received', 'Received')).not.toThrow();
    });
});

describe('paymentStateMachine — computeAggregateStatus', () => {
    it('returns Pending for empty array', () => {
        expect(computeAggregateStatus([])).toBe('Pending');
    });

    it('returns Pending for null/undefined input', () => {
        expect(computeAggregateStatus(null)).toBe('Pending');
        expect(computeAggregateStatus(undefined)).toBe('Pending');
    });

    it('returns Received when all staff payments are Received', () => {
        const payments = [
            { status: 'Received' },
            { status: 'Received' },
            { status: 'Received' },
        ];
        expect(computeAggregateStatus(payments)).toBe('Received');
    });

    it('returns Received when all are Disbursed or Settled', () => {
        const payments = [
            { status: 'Disbursed' },
            { status: 'Settled' },
        ];
        expect(computeAggregateStatus(payments)).toBe('Received');
    });

    it('returns Partial when some are Received and some are Pending', () => {
        const payments = [
            { status: 'Received' },
            { status: 'Pending' },
        ];
        expect(computeAggregateStatus(payments)).toBe('Partial');
    });

    it('returns Partial when some are Sent', () => {
        const payments = [
            { status: 'Sent' },
            { status: 'Pending' },
        ];
        expect(computeAggregateStatus(payments)).toBe('Partial');
    });

    it('returns Disputed when any payment is Disputed', () => {
        const payments = [
            { status: 'Received' },
            { status: 'Disputed' },
            { status: 'Pending' },
        ];
        expect(computeAggregateStatus(payments)).toBe('Disputed');
    });

    it('returns Pending when all are Pending', () => {
        const payments = [
            { status: 'Pending' },
            { status: 'Pending' },
        ];
        expect(computeAggregateStatus(payments)).toBe('Pending');
    });
});

describe('paymentStateMachine — structural integrity', () => {
    it('ALL_STATES contains exactly 7 states', () => {
        expect(ALL_STATES.size).toBe(7);
    });

    it('every state in VALID_TRANSITIONS is in ALL_STATES', () => {
        for (const from of Object.keys(VALID_TRANSITIONS)) {
            expect(ALL_STATES.has(from)).toBe(true);
            for (const to of VALID_TRANSITIONS[from]) {
                expect(ALL_STATES.has(to)).toBe(true);
            }
        }
    });

    it('no state in VALID_TRANSITIONS has transitions out of TERMINAL_STATES', () => {
        for (const terminal of TERMINAL_STATES) {
            expect(VALID_TRANSITIONS[terminal]).toBeUndefined();
        }
    });
});
