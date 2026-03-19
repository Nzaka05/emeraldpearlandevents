const mongoose = require('mongoose');

const SupervisorNotificationSchema = new mongoose.Schema({
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    type: { 
        type: String, 
        enum: ['clock_in_denied', 'expense_approved', 'emergency_fund_approved', 'admin_message', 'staff_missing', 'risk_escalation', 'event_update', 'team_update'], 
        required: true 
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed }, // Arbitrary JSON data related to notification
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

SupervisorNotificationSchema.index({ event_id: 1, createdAt: -1 });
SupervisorNotificationSchema.index({ supervisor_id: 1, read: 1 });

module.exports = mongoose.models.SupervisorNotification ||
    mongoose.model('SupervisorNotification', SupervisorNotificationSchema);
