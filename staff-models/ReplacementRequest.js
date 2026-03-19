const mongoose = require('mongoose');

const replacementRequestSchema = new mongoose.Schema({
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EventTeam', required: true },
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    member_to_remove: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    suggested_replacement: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }, // Optional
    submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true }, // Supervisor
    reason: { type: String },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.ReplacementRequest || mongoose.model('ReplacementRequest', replacementRequestSchema);
