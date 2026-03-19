const mongoose = require('mongoose');

const serviceLineSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
});

const ClientInvoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    clientId: { type: String, default: '' },
    clientName: { type: String, required: true },
    clientEmail: { type: String, required: true },
    clientPhone: { type: String, default: '' },
    companyName: { type: String, default: '' },
    eventName: { type: String, required: true },
    eventDate: { type: Date },
    eventLocation: { type: String, default: '' },
    services: [serviceLineSchema],
    subtotal: { type: Number, default: 0 },
    vatRate: { type: Number, default: 16 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'KES' },
    paymentMethod: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'partial'], default: 'pending' },
    invoiceStatus: { type: String, enum: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'], default: 'Draft' },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    pdfUrl: { type: String, default: '' },
    notes: { type: String, default: '' },
    thankYouSentAt: { type: Date },
    invoiceEmailSentAt: { type: Date },
    surveySentAt: { type: Date },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    // ── Electronic Tax Receipt (ETR) ──────────────────────────────────────────
    etrNumber:   { type: String, default: '' },
    etrIssuedAt: { type: Date }
}, { timestamps: true });

ClientInvoiceSchema.pre('save', async function() {
    if (this.isNew && !this.invoiceNumber) {
        const count = await this.constructor.countDocuments();
        const year = new Date().getFullYear();
        this.invoiceNumber = 'EPE-INV-' + year + '-' + String(count + 1).padStart(4, '0');
    }
});

module.exports = mongoose.model('ClientInvoice', ClientInvoiceSchema);
