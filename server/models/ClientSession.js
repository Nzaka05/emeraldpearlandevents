const mongoose = require('mongoose');

const clientSessionSchema = new mongoose.Schema({
    client_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    refresh_token_hash: {
        type: String,
        required: true
    },
    ip_address: {
        type: String
    },
    user_agent: {
        type: String
    },
    device_name: {
        type: String
    },
    last_active: {
        type: Date,
        default: Date.now
    },
    is_active: {
        type: Boolean,
        default: true
    },
    expires_at: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// TTL index to automatically purge expired sessions
// The requirement strictly says: "expireAfterSeconds 0" on "expires_at"
clientSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ClientSession', clientSessionSchema);
