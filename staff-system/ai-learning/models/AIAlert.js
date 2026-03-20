const mongoose = require('mongoose');

const aiAlertSchema = new mongoose.Schema({
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    alert_type: {
        type: String,
        enum: ['HIGH_RISK', 'ANOMALY', 'STAFFING_GAP', 'EMERGENCY_FUND', 'EVENT_NOT_READY', 'BUDGET_OVERRUN', 'CUSTOM'],
        required: true
    },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    message: { type: String, required: true },
    status: { type: String, enum: ['unread', 'read', 'resolved'], default: 'unread' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });

aiAlertSchema.index({ event_id: 1, status: 1 });
aiAlertSchema.index({ created_at: -1 });

module.exports = mongoose.model('AIAlert', aiAlertSchema);
