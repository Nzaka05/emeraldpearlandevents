const mongoose = require('mongoose');

const eventTeamCommunicationSchema = new mongoose.Schema({
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EventTeam', required: true },
    message_type: {
        type: String,
        enum: ['announcement', 'shift_reminder', 'arrival_confirmation', 'location_update'],
        required: true
    },
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    message_content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.models.EventTeamCommunication || mongoose.model('EventTeamCommunication', eventTeamCommunicationSchema);
