/**
 * Emerald Pearl Events - Ledger Service
 *
 * Implements strict double-entry ledger mechanisms.
 * All financial reads/writes must go through this layer.
 */

const Transaction = require('../../models/Transaction');
const EventLedger = require('../../models/EventLedger');
const { roundToTwo, calculateEventProfit } = require('../utils/calculationEngine');

/**
 * Initializes a new Event Ledger.
 * @param {String} event_id 
 * @param {String} client_id 
 * @param {Number} event_budget (Total from client invoice)
 */
exports.initializeEventLedger = async (event_id, client_id, event_budget) => {
    const existingLedger = await EventLedger.findOne({ eventId: event_id });
    if (existingLedger) {
        throw new Error('Ledger already exists for this event');
    }

    const ledger = await EventLedger.create({
        eventId: event_id,
        clientId: client_id || null,
        status: 'Active',
        totals: {
            budget: event_budget || 0,
            expenses: 0,
            payroll: 0,
            emergency_funds_used: 0,
            profit: event_budget || 0, // Initially, profit is the entire budget
            balance: event_budget || 0 // Amount left in the event bucket
        }
    });

    return ledger;
};

/**
 * Logs a financial transaction using double-entry methodology.
 * Records global Transaction and updates EventLedger totals.
 */
exports.recordTransaction = async ({ event_id, type, amount, direction, description, paymentMethod, createdBy, referenceModel, referenceId }) => {
    if (!amount || amount <= 0) throw new Error('Transaction amount must be positive');
    if (!['in', 'out'].includes(direction)) throw new Error('Direction must be in or out');

    const cleanAmount = roundToTwo(amount);

    // 1. Fetch Event Ledger
    const ledger = await EventLedger.findOne({ eventId: event_id });
    if (!ledger) {
        throw new Error('Event Ledger not found. Cannot process transaction.');
    }

    // 2. Insert Global Transaction First (Durability)
    const transaction = await Transaction.create({
        type, 
        sourceSystem: 'finance-engine',
        eventId: event_id,
        amount: cleanAmount,
        currency: 'KES',
        direction,
        description,
        paymentMethod,
        createdBy,
        referenceModel,
        referenceId
    });

    // 3. Update Ledger Totals
    if (type === 'clientPayment' && direction === 'in') {
        ledger.totals.budget = roundToTwo(ledger.totals.budget + cleanAmount);
        ledger.totals.balance = roundToTwo(ledger.totals.balance + cleanAmount);
    } else if (type === 'expense' && direction === 'out') {
        ledger.totals.expenses = roundToTwo(ledger.totals.expenses + cleanAmount);
        ledger.totals.balance = roundToTwo(ledger.totals.balance - cleanAmount);
    } else if (type === 'emergency_fund' && direction === 'out') {
        ledger.totals.emergency_funds_used = roundToTwo(ledger.totals.emergency_funds_used + cleanAmount);
        ledger.totals.balance = roundToTwo(ledger.totals.balance - cleanAmount);
    } else if (type === 'payroll' && direction === 'out') {
        ledger.totals.payroll = roundToTwo(ledger.totals.payroll + cleanAmount);
        ledger.totals.balance = roundToTwo(ledger.totals.balance - cleanAmount);
    }

    // Recalculate generic profit based on updated values
    ledger.totals.profit = calculateEventProfit(
        ledger.totals.budget,
        ledger.totals.expenses,
        ledger.totals.payroll,
        ledger.totals.emergency_funds_used
    );

    // Append history
    ledger.history.push({
        transactionId: transaction._id,
        description,
        amount: cleanAmount,
        direction,
        balanceAfter: ledger.totals.balance,
        date: new Date()
    });

    await ledger.save();

    // 4. Fire socket event for live telemetry
    if (global.io) {
        global.io.to('Admin').emit('liveFinanceUpdate', {
            eventId: event_id,
            type,
            amount: cleanAmount,
            direction,
            newTotals: ledger.totals
        });
    }

    return transaction;
};

/**
 * Gets financial telemetry for a specific event
 */
exports.getEventFinancialTelemetry = async (event_id) => {
    const ledger = await EventLedger.findOne({ eventId: event_id });
    if (!ledger) return null;
    return ledger.totals;
};
