const mongoose = require('mongoose');

const teamActionsLogSchema = new mongoose.Schema({
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EventTeam', required: true },
    action_type: { type: String, required: true }, // e.g., 'MEMBER_REMOVED', 'MEMBER_ADDED', 'REPLACEMENT_SUGGESTED'
    performed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    reason: { type: String },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.models.TeamActionsLog || mongoose.models.TeamActionsLog || mongoose.model('TeamActionsLog', teamActionsLogSchema);

