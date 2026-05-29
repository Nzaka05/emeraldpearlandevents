// ═══════════════════════════════════════════════════════════
// OTP VERIFICATION MODEL — Stores hashed OTPs for password change
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');

const OTPVerificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    userModel: {
        type: String,
        enum: ['Admin', 'Staff'],
        required: true
    },
    otpHash: {
        type: String,
        required: true
    },
    purpose: {
        type: String,
        default: 'password_change'
    },
    expiresAt: {
        type: Date,
        required: true
    },
    used: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index for fast lookups by user + purpose
OTPVerificationSchema.index({ userId: 1, purpose: 1 });

// TTL index — MongoDB auto-deletes expired documents
OTPVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTPVerification', OTPVerificationSchema);
