const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    date: { type: Date, required: true },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    pay_rate: { type: Number, required: true },
    vip_flag: { type: Boolean, default: false },
    special_instructions: { type: String },
    dress_code: { type: String },
    gps_location: {
        lat: { type: Number },
        lng: { type: Number }
    },
    supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    assigned_staff_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    required_staff_count: {
        type: Number,
        default: 1
    },
    accepted_staff_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    declined_staff_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    applicant_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    booking_ref: { type: String, default: null },
    client_name: { type: String, default: '' },
    client_email: { type: String, default: '' },
    clientPaymentAmount: { type: Number, default: 0 },
    usherCount: { type: Number, default: 0 },
    status: { type: String, enum: ['Active', 'Completed', 'Cancelled'], default: 'Active' },
    lifecycle_state: {
        type: String,
        enum: ['PLANNED', 'STAFFING', 'READY', 'LIVE', 'COMPLETED', 'FINANCE_SETTLED'],
        default: 'PLANNED'
    },
    payment_status: { type: String, enum: ['Pending', 'Sent', 'Received', 'Disputed', 'Partial'], default: 'Pending' },
    staff_payments: [{
        staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
        staff_name: { type: String },
        amount: { type: Number },
        status: { type: String, enum: ['Pending', 'Sent', 'Received', 'Disputed'], default: 'Pending' },
        payment_method: { type: String, enum: ['MPesa', 'Cash', 'Bank'], default: 'MPesa' },
        sent_at: { type: Date },
        received_at: { type: Date },
        phone: { type: String },
        transaction_id: { type: String },
        receipt_number: { type: String },
        notes: { type: String }
    }],
    payment_confirmed_at: { type: Date }, // When staff confirms payment received
    payment_disputed_reason: { type: String }, // Reason for dispute if payment is disputed
    // ── Phase 1: Payment sync status tracking ─────────────────────────────────
    // Tracks whether M-Pesa payment data for this assignment has been synced
    // from the booking system. The reconciliation cron retries 'failed'/'pending'.
    paymentSyncStatus: {
        type: String,
        enum: ['pending', 'synced', 'failed'],
        default: 'pending'
    },
    // ── Phase 1: M-Pesa idempotency key ───────────────────────────────────────
    // Deduplicates M-Pesa callbacks that arrive late or are retried by Safaricom.
    // Format: mpesa-{checkoutRequestId}-{amount}
    // Set on the assignment when a payment write is initiated.
    idempotencyKey: {
        type: String,
        default: null,
        sparse: true  // allows multiple null values — only non-null must be unique
    },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    open_for_applications: {
        type: Boolean,
        default: false
    },
    createdAt: { type: Date, default: Date.now }
});

// Indexes for performance
assignmentSchema.index({ gps_location: '2d' }); // 2d for {lat, lng} legacy pairs
assignmentSchema.index({ supervisor_id: 1, payment_status: 1 });
assignmentSchema.index({ status: 1, date: 1 });
assignmentSchema.index({ 'staff_payments.staff_id': 1, 'staff_payments.status': 1 }); // Compound for staff payments
assignmentSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true }); // Phase 1: dedup M-Pesa writes
assignmentSchema.index({ paymentSyncStatus: 1 }); // Phase 1: reconciliation queries

module.exports = mongoose.models.Assignment || mongoose.model('Assignment', assignmentSchema);
