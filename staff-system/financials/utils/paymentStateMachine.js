/**
 * paymentStateMachine.js — Enforces valid payment status transitions
 *
 * Every staff_payment.status change MUST pass through validateTransition().
 * Invalid transitions are rejected with an error — never silently ignored.
 *
 * States:
 *   PENDING    → Initial state. Payment not yet initiated.
 *   SENT       → B2C request sent to Safaricom. Awaiting callback.
 *   RECEIVED   → Payment confirmed received by staff (callback or manual).
 *   FAILED     → B2C failed (callback or timeout). Eligible for retry.
 *   DISPUTED   → Staff disputes the payment amount or receipt.
 *   DISBURSED  → Payroll disbursement confirmed (legacy compatibility).
 *   SETTLED    → Event finances closed. Terminal state.
 *
 * Transition Rules:
 *   Pending  → Sent       Admin initiates M-Pesa B2C
 *   Pending  → Received   Cash payment or manual confirmation
 *   Pending  → Failed     B2C initiation error (before Safaricom accepts)
 *   Sent     → Received   Safaricom callback: ResultCode === 0
 *   Sent     → Failed     Safaricom callback: ResultCode !== 0, or timeout
 *   Failed   → Pending    Admin retries the payment
 *   Received → Disputed   Staff flags incorrect amount
 *   Received → Settled    Event lifecycle reaches FINANCE_SETTLED
 *   Received → Disbursed  Legacy: payroll service marks as disbursed
 *   Disputed → Received   Admin resolves the dispute
 *   Disputed → Pending    Admin voids and re-initiates
 *   Disbursed → Settled   Event lifecycle closes
 */

// Valid transitions: Map<fromState, Set<toState>>
const VALID_TRANSITIONS = {
    Pending:   new Set(['Sent', 'Received', 'Failed']),
    Sent:      new Set(['Received', 'Failed']),
    Failed:    new Set(['Pending']),
    Received:  new Set(['Disputed', 'Settled', 'Disbursed']),
    Disputed:  new Set(['Received', 'Pending']),
    Disbursed: new Set(['Settled'])
};

// Terminal states — no transitions out of these
const TERMINAL_STATES = new Set(['Settled']);

// All valid states
const ALL_STATES = new Set([
    'Pending', 'Sent', 'Received', 'Failed',
    'Disputed', 'Disbursed', 'Settled'
]);

/**
 * Validate a payment status transition.
 *
 * @param {string} from — current status
 * @param {string} to   — desired new status
 * @returns {{ valid: boolean, error?: string }}
 */
function validateTransition(from, to) {
    // Validate that both states are recognized
    if (!ALL_STATES.has(from)) {
        return { valid: false, error: `Unknown current state: '${from}'` };
    }
    if (!ALL_STATES.has(to)) {
        return { valid: false, error: `Unknown target state: '${to}'` };
    }

    // No-op transitions are always valid (idempotent)
    if (from === to) {
        return { valid: true };
    }

    // Terminal states cannot transition
    if (TERMINAL_STATES.has(from)) {
        return { valid: false, error: `Cannot transition from terminal state '${from}'` };
    }

    // Check the transition map
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed || !allowed.has(to)) {
        return {
            valid: false,
            error: `Invalid transition: '${from}' → '${to}'. Allowed: [${[...(allowed || [])].join(', ')}]`
        };
    }

    return { valid: true };
}

/**
 * Assert a transition is valid. Throws if not.
 *
 * @param {string} from
 * @param {string} to
 * @param {string} [context] — optional context for the error message
 * @throws {Error} if the transition is invalid
 */
function assertTransition(from, to, context = '') {
    const result = validateTransition(from, to);
    if (!result.valid) {
        const prefix = context ? `[${context}] ` : '';
        throw new Error(`${prefix}${result.error}`);
    }
}

/**
 * Determine the aggregate assignment payment_status from individual staff payment statuses.
 *
 * @param {Array<{ status: string }>} staffPayments
 * @returns {string} — one of: 'Pending', 'Partial', 'Sent', 'Received', 'Disputed'
 */
function computeAggregateStatus(staffPayments) {
    if (!staffPayments || staffPayments.length === 0) return 'Pending';

    const total = staffPayments.length;
    const received = staffPayments.filter(p => ['Received', 'Disbursed', 'Settled'].includes(p.status)).length;
    const sent = staffPayments.filter(p => p.status === 'Sent').length;
    const disputed = staffPayments.filter(p => p.status === 'Disputed').length;

    if (disputed > 0) return 'Disputed';
    if (received === total && total > 0) return 'Received';
    if (received > 0 || sent > 0) return 'Partial';
    return 'Pending';
}

module.exports = {
    validateTransition,
    assertTransition,
    computeAggregateStatus,
    VALID_TRANSITIONS,
    TERMINAL_STATES,
    ALL_STATES
};
