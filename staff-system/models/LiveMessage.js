const mongoose = require('mongoose');

/**
 * LiveMessage — Admin ↔ Supervisor real-time communication model
 * Used by the Live Event Command Center (Phase 12)
 */
const liveMessageSchema = new mongoose.Schema({
    sender_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    sender_name:  { type: String, required: true },
    sender_role:  { type: String, enum: ['Admin', 'Supervisor'], required: true },
    recipient_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null }, // null = broadcast to all admins
    assignment_id:{ type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
    content:      { type: String, default: '' },
    attachment_url:  { type: String, default: null }, // uploaded image/video URL
    attachment_type: { type: String, enum: ['image', 'video', null], default: null },
    is_emergency: { type: Boolean, default: false },
    emergency_acked: { type: Boolean, default: false },
    emergency_acked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    read:         { type: Boolean, default: false },
    timestamp:    { type: Date, default: Date.now }
}, { collection: 'live_messages' });

liveMessageSchema.index({ timestamp: -1 });
liveMessageSchema.index({ is_emergency: 1, emergency_acked: 1 });

module.exports = mongoose.models.LiveMessage || mongoose.model('LiveMessage', liveMessageSchema);

