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

TransactionSchema.pre('save', async function() {
    if (this.isNew && !this.transactionId) {
        const count = await this.constructor.countDocuments();
        const year = new Date().getFullYear();
        this.transactionId = 'EPE-TXN-' + year + '-' + String(count + 1).padStart(4, '0');
    }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
