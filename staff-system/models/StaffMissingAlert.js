const mongoose = require('mongoose');

const StaffMissingAlertSchema = new mongoose.Schema({
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    minutes_late: { type: Number, required: true },
    alerted_at: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false },
    resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    resolved_at: { type: Date }
}, { timestamps: true });

// Prevent duplicate active alerts for same staff on same event
StaffMissingAlertSchema.index({ event_id: 1, staff_id: 1, resolved: 1 });

module.exports = mongoose.models.StaffMissingAlert ||
    mongoose.models.StaffMissingAlert || mongoose.model('StaffMissingAlert', StaffMissingAlertSchema);

