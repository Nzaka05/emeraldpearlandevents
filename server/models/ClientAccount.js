const mongoose = require('mongoose');

const clientAccountSchema = new mongoose.Schema({
    client_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password_hash: {
        type: String,
        required: function() { return this.provider === 'local'; }
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    provider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
    },
    last_login: {
        type: Date
    },
    last_active: {
        type: Date
    },
    login_attempts: {
        type: Number,
        default: 0
    },
    locked_until: {
        type: Date
    },
    reset_token: {
        type: String
    },
    reset_token_expiry: {
        type: Date
    },
    portal_access_enabled: {
        type: Boolean,
        default: true
    },
    two_fa_enabled: {
        type: Boolean,
        default: false
    },
    two_fa_secret: {
        type: String // Encrypted string
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ClientAccount', clientAccountSchema);
