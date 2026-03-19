const mongoose = require('mongoose');

const ClientPaymentSchema = new mongoose.Schema({
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    clientName: { type: String, default: '' },
    clientEmail: { type: String, default: '' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'KES' },
    paymentMethod: { type: String, enum: ['MPesa', 'Bank Transfer', 'PayPal', 'Cash', 'Card', 'Other'], default: 'MPesa' },
    transactionId: { type: String, default: '' },
    paymentDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Pending', 'Confirmed', 'Failed', 'Refunded'], default: 'Confirmed' },
    notes: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    receiptNumber: { type: String, default: '' }
}, { timestamps: true });

ClientPaymentSchema.pre('save', async function() {
    if (this.isNew && !this.receiptNumber) {
        const count = await this.constructor.countDocuments();
        const year = new Date().getFullYear();
        this.receiptNumber = 'EPE-PMT-' + year + '-' + String(count + 1).padStart(4, '0');
    }
});

module.exports = mongoose.model('ClientPayment', ClientPaymentSchema);
