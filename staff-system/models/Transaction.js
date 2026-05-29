const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    transactionId: { type: String, unique: true },
    type: { type: String, enum: ['clientPayment', 'staffPayroll', 'expense', 'refund', 'adjustment', 'invoice'], required: true },
    sourceSystem: { type: String, enum: ['main-portal', 'staff-portal'], default: 'staff-portal' },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    eventName: { type: String, default: '' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'KES' },
    direction: { type: String, enum: ['in', 'out'], required: true },
    description: { type: String, required: true },
    paymentMethod: { type: String, default: '' },
    referenceCollection: { type: String, default: '' },
    referenceId: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'Completed', 'Failed', 'Reversed'], default: 'Completed' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// Atomic ID generation using Counter collection.
// The old countDocuments() approach was vulnerable to race conditions:
// two concurrent saves could both read count=5 and both generate ID "...0006".
TransactionSchema.pre('save', async function() {
    if (this.isNew && !this.transactionId) {
        const { getNextSequence } = require('./Counter');
        const seq = await getNextSequence('Transaction');
        const year = new Date().getFullYear();
        this.transactionId = 'EPE-TXN-' + year + '-' + String(seq).padStart(4, '0');
    }
});

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
