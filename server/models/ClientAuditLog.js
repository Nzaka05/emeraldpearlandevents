const mongoose = require('mongoose');

const clientAuditLogSchema = new mongoose.Schema({
    client_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    event_type: {
        type: String,
        required: true,
        enum: [
            'login_success', 
            'login_failure', 
            'logout', 
            'password_change', 
            'password_reset_request', 
            'password_reset_complete', 
            'invoice_download', 
            'etr_view', 
            'session_revoked', 
            'access_disabled', 
            'two_fa_enabled', 
            'two_fa_disabled'
        ]
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
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

// Explicitly ensure no TTL exists on Audit logs
// Audit logs must never auto-delete

module.exports = mongoose.model('ClientAuditLog', clientAuditLogSchema);
