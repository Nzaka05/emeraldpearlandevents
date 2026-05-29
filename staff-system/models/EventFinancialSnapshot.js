const mongoose = require('mongoose');

const EventFinancialSnapshotSchema = new mongoose.Schema({
    snapshotId: { type: String, unique: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, unique: true },
    eventName: { type: String, default: '' },
    eventDate: { type: Date },
    clientName: { type: String, default: '' },
    clientPayment: { type: Number, default: 0 },
    staffPayrollTotal: { type: Number, default: 0 },
    operationalExpenses: { type: Number, default: 0 },
    incidentExpenses: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    grossRevenue: { type: Number, default: 0 },
    eventProfit: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 0 },
    staffCount: { type: Number, default: 0 },
    snapshotDate: { type: Date, default: Date.now },
    isFinal: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }
}, { timestamps: true });

EventFinancialSnapshotSchema.pre('save', async function() {
    if (this.isNew && !this.snapshotId) {
        const { getNextSequence } = require('./Counter');
        const seq = await getNextSequence('EventFinancialSnapshot');
        const year = new Date().getFullYear();
        this.snapshotId = 'EPE-SNP-' + year + '-' + String(seq).padStart(4, '0');
    }
    this.totalExpenses = (this.staffPayrollTotal || 0) + (this.operationalExpenses || 0) + (this.incidentExpenses || 0);
    this.eventProfit = (this.clientPayment || 0) - this.totalExpenses;
    this.profitMargin = this.clientPayment > 0 ? Math.round((this.eventProfit / this.clientPayment) * 100) : 0;
});

module.exports = mongoose.models.EventFinancialSnapshot || mongoose.model('EventFinancialSnapshot', EventFinancialSnapshotSchema);

