const mongoose = require('mongoose');

const eventTeamCommunicationSchema = new mongoose.Schema({
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EventTeam', required: true },
    message_type: {
        type: String,
        enum: ['announcement', 'shift_reminder', 'arrival_confirmation', 'location_update', 'system', 'Chat'],
        required: true
    },
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    message_content: { type: String, required: true },
    caption: { type: String, default: '' },
    media_url: { type: String, default: '' },
    media_type: { type: String, enum: ['none', 'image', 'video'], default: 'none' },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.models.EventTeamCommunication || mongoose.model('EventTeamCommunication', eventTeamCommunicationSchema);

