const mongoose = require('mongoose');

const webAuthnChallengeSchema = new mongoose.Schema({
    admin_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Admin'
    },
    challenge: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['registration', 'authentication'],
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    }
}, { timestamps: true });

// TTL index automatically deletes documents when expiresAt is reached
webAuthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
webAuthnChallengeSchema.index({ admin_id: 1, type: 1 });

module.exports = mongoose.model('WebAuthnChallenge', webAuthnChallengeSchema);
