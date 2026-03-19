const mongoose = require('mongoose');

const BiometricSessionSchema = new mongoose.Schema({
    admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    device_id: { type: String, required: true },
    verified_at: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    ip_address: { type: String, default: '' },
    user_agent: { type: String, default: '' }
});

// TTL index — MongoDB auto-deletes documents after expiresAt
BiometricSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Query index for lookups
BiometricSessionSchema.index({ admin_id: 1, device_id: 1 });

module.exports = mongoose.models.BiometricSession ||
    mongoose.models.BiometricSession || mongoose.model('BiometricSession', BiometricSessionSchema);

