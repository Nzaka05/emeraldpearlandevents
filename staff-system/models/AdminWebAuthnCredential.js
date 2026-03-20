const mongoose = require('mongoose');

const adminWebAuthnCredentialSchema = new mongoose.Schema({
    admin_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Admin'
    },
    credential_id: {
        type: String,
        required: true,
        unique: true
    },
    public_key: {
        type: String, // Stored as base64 or hex
        required: true
    },
    counter: {
        type: Number,
        required: true,
        default: 0
    },
    device_name: {
        type: String,
        default: 'Unknown Device'
    },
    registered_at: {
        type: Date,
        default: Date.now
    },
    last_used: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

adminWebAuthnCredentialSchema.index({ admin_id: 1 });

module.exports = mongoose.model('AdminWebAuthnCredential', adminWebAuthnCredentialSchema);
