/**
 * Counter.js — Atomic sequence generator
 *
 * Replaces the race-vulnerable `countDocuments()` pattern used in
 * Transaction.js, StaffPayroll.js, and EventFinancialSnapshot.js.
 *
 * MongoDB's findOneAndUpdate with $inc is a single atomic operation —
 * two concurrent callers will ALWAYS get different sequence numbers.
 *
 * Usage:
 *   const { getNextSequence } = require('./Counter');
 *   const seq = await getNextSequence('Transaction');
 *   // seq = 1, 2, 3, ... (never duplicated)
 */

const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },   // e.g., 'Transaction', 'StaffPayroll'
    seq: { type: Number, default: 0 }
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

/**
 * Atomically increment and return the next sequence number.
 * Creates the counter document on first use (upsert: true).
 *
 * @param {string} name — counter name (typically the model name)
 * @returns {Promise<number>} — the next unique sequence number
 */
async function getNextSequence(name) {
    const result = await Counter.findByIdAndUpdate(
        name,
        { $inc: { seq: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return result.seq;
}

module.exports = Counter;
module.exports.getNextSequence = getNextSequence;
