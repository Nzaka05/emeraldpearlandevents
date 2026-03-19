const mongoose = require('mongoose');

const EventLedgerSchema = new mongoose.Schema({
    ledgerId: { 
        type: String, 
        unique: true,
        default: function() {
            return `LED-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        }
    },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    type: { type: String, enum: ['clientPayment', 'staffPayroll', 'operationalExpense', 'incidentPayment', 'refund', 'adjustment'], required: true },
    referenceId: { type: String, default: '' },
    referenceModel: { type: String, default: '' },
    amount: { type: Number, required: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    description: { type: String, required: true },
    paymentMethod: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    balanceAfter: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// Legacy pre-save ledgerId generator removed in favor of native schema defaults

module.exports = mongoose.models.EventLedger || mongoose.model('EventLedger', EventLedgerSchema);

