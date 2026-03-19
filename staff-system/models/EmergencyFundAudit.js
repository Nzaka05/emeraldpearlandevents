const mongoose = require('mongoose');

const EmergencyFundAuditSchema = new mongoose.Schema({
    admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    amount: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },

    // Admin location at time of authorization
    admin_lat: { type: Number },
    admin_lng: { type: Number },
    admin_device_id: { type: String, default: '' },
    ip_address: { type: String, default: '' },

    // Server-set only — never from request body
    biometric_verified: { type: Boolean, default: false },

    // Approval
    approval_type: { type: String, enum: ['otp', 'second_admin', 'none'], default: 'none' },
    approval_status: { type: String, enum: ['approved', 'rejected', 'pending', 'expired'], default: 'pending' },

    // Dual Approval Enforcement Matrix
    first_admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    first_admin_verified_at: { type: Date },
    first_admin_lat: { type: Number },
    first_admin_lng: { type: Number },
    
    second_admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    second_admin_verified_at: { type: Date },
    second_admin_lat: { type: Number },
    second_admin_lng: { type: Number },
    
    dual_approval_required: { type: Boolean, default: false },
    dual_approval_completed: { type: Boolean, default: false },
    dual_approval_expires_at: { type: Date },

    // Reason
    reason: { type: String, default: '' },
    reason_category: { type: String, enum: ['logistics', 'staff_emergency', 'equipment', 'other'], default: 'other' },

    // Payout
    target_phone_number: { type: String, default: '' },
    payout_status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    payout_reference: { type: String, default: '' },
    failure_reason: { type: String, default: '' },

    // Fraud detection
    fraud_flags: [{ type: String }],

    // Payout lock
    payout_locked: { type: Boolean, default: false },
    locked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    lock_reason: { type: String, default: '' },
    unlocked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },

    // Venue coordinates (reference only — not used for rejection)
    venue_lat: { type: Number },
    venue_lng: { type: Number }
});

EmergencyFundAuditSchema.index({ admin_id: 1, timestamp: -1 });
EmergencyFundAuditSchema.index({ event_id: 1, timestamp: -1 });
EmergencyFundAuditSchema.index({ payout_status: 1 });

module.exports = mongoose.models.EmergencyFundAudit ||
    mongoose.models.EmergencyFundAudit || mongoose.model('EmergencyFundAudit', EmergencyFundAuditSchema);

