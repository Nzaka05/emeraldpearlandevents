const mongoose = require('mongoose');

const EmergencyOtpSchema = new mongoose.Schema({
    admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    otp_hash: { type: String, required: true },
    device_id: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, max: 3 },
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// TTL index — auto-delete after 5 minutes (expiresAt)
EmergencyOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Lookup index
EmergencyOtpSchema.index({ admin_id: 1, event_id: 1, device_id: 1 });

module.exports = mongoose.models.EmergencyOtp ||
    mongoose.model('EmergencyOtp', EmergencyOtpSchema);
