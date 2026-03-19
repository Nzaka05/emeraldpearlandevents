const mongoose = require('mongoose');

const ExpenseReceiptSchema = new mongoose.Schema({
    expenseId: { type: String, unique: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    incidentId: { type: String, default: '' },
    category: { type: String, enum: ['transport', 'equipment', 'incident', 'logistics', 'catering', 'venue', 'other'], default: 'other' },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    recipient: { type: String, default: '' },
    paymentMethod: { type: String, enum: ['MPesa', 'Bank Transfer', 'Cash', 'Card', 'Other'], default: 'Cash' },
    transactionId: { type: String, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    adminExplanation: { type: String, default: '' },
    paymentDate: { type: Date, default: Date.now },
    receiptNumber: { type: String, default: '' },
    receiptImageUrl: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Approved' }
}, { timestamps: true });

ExpenseReceiptSchema.pre('save', async function() {
    if (this.isNew && !this.expenseId) {
        const count = await this.constructor.countDocuments();
        const year = new Date().getFullYear();
        this.expenseId = 'EPE-EXP-' + year + '-' + String(count + 1).padStart(4, '0');
    }
});

module.exports = mongoose.models.ExpenseReceipt || mongoose.model('ExpenseReceipt', ExpenseReceiptSchema);

