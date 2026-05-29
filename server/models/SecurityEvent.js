const mongoose = require('mongoose');

const SecurityEventSchema = new mongoose.Schema({
    eventType: {
        type: String,
        enum: ['login_success', 'login_failed', 'role_change', 'secret_rotation', 'payout_attempt', 'sso_used', 'session_revoked'],
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null
    },
    userEmail: {
        type: String,
        required: true
    },
    ipAddress: {
        type: String,
        default: null
    },
    userAgent: {
        type: String,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: false });

SecurityEventSchema.index({ createdAt: -1 });
SecurityEventSchema.index({ eventType: 1, createdAt: -1 });
SecurityEventSchema.index({ userEmail: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityEvent', SecurityEventSchema);
