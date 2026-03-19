const mongoose = require('mongoose');

const StaffPayrollSchema = new mongoose.Schema({
    paymentId: { type: String, unique: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    staffName: { type: String, default: '' },
    staffRole: { type: String, default: '' },
    staffPhone: { type: String, default: '' },
    hoursWorked: { type: Number, default: 0 },
    basePay: { type: Number, default: 0 },
    overtimePay: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    totalPay: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['MPesa', 'Bank Transfer', 'Cash', 'Other'], default: 'MPesa' },
    transactionId: { type: String, default: '' },
    mpesaReceiptNumber: { type: String, default: '' },
    paymentDate: { type: Date },
    status: { type: String, enum: ['Pending', 'Sent', 'Received', 'Disputed', 'Disbursed'], default: 'Pending' },
    receiptNumber: { type: String, default: '' },
    notes: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }
}, { timestamps: true });

StaffPayrollSchema.pre('save', async function() {
    if (this.isNew && !this.paymentId) {
        const count = await this.constructor.countDocuments();
        const year = new Date().getFullYear();
        this.paymentId = 'EPE-PAY-' + year + '-' + String(count + 1).padStart(4, '0');
    }
    this.totalPay = (this.basePay || 0) + (this.overtimePay || 0) + (this.bonus || 0) - (this.deductions || 0);
});

module.exports = mongoose.models.StaffPayroll || mongoose.model('StaffPayroll', StaffPayrollSchema);

