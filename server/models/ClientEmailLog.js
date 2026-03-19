const mongoose = require('mongoose');

const clientEmailLogSchema = new mongoose.Schema({
    client_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    event_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Assignment',
        required: false
    },
    email_type: {
        type: String,
        required: true
    },
    recipient_email: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['sent', 'failed'],
        required: true
    },
    error_message: {
        type: String
    },
    sent_at: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

// Explicitly ensure no TTL exists on Email logs
// Email logs must never auto-delete

module.exports = mongoose.model('ClientEmailLog', clientEmailLogSchema);
