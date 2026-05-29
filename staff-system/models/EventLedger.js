const mongoose = require('mongoose');

const LedgerTotalsSchema = new mongoose.Schema({
    budget: { type: Number, default: 0 },
    expenses: { type: Number, default: 0 },
    payroll: { type: Number, default: 0 },
    emergency_funds_used: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }
}, { _id: false });

const LedgerHistorySchema = new mongoose.Schema({
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    description: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    direction: { type: String, enum: ['in', 'out'], default: 'out' },
    balanceAfter: { type: Number, default: 0 },
    date: { type: Date, default: Date.now }
}, { _id: false });

const EventLedgerSchema = new mongoose.Schema({
    ledgerId: { 
        type: String, 
        unique: true,
        default: function() {
            return `LED-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        }
    },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    status: { type: String, enum: ['Active', 'Closed'], default: 'Active' },
    totals: { type: LedgerTotalsSchema, default: () => ({}) },
    history: { type: [LedgerHistorySchema], default: [] },

    // Legacy line-item fields kept optional for backward compatibility.
    type: { type: String, enum: ['clientPayment', 'staffPayroll', 'operationalExpense', 'incidentPayment', 'refund', 'adjustment'] },
    referenceId: { type: String, default: '' },
    referenceModel: { type: String, default: '' },
    amount: { type: Number },
    direction: { type: String, enum: ['in', 'out'] },
    description: { type: String },
    paymentMethod: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    balanceAfter: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// Legacy pre-save ledgerId generator removed in favor of native schema defaults

module.exports = mongoose.models.EventLedger || mongoose.model('EventLedger', EventLedgerSchema);

