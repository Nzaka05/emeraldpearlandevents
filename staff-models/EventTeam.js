const mongoose = require('mongoose');

const eventTeamSchema = new mongoose.Schema({
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    member_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    status: { type: String, enum: ['Forming', 'Active', 'Completed'], default: 'Forming' },
    team_readiness: { type: Number, default: 0 }, // 0 to 100 representing % confirmed available and clocked in
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.EventTeam || mongoose.models.EventTeam || mongoose.model('EventTeam', eventTeamSchema);

