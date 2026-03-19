const mongoose = require('mongoose');

const supervisorRatingProfileSchema = new mongoose.Schema({
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, unique: true },
    
    total_events_supervised: { type: Number, default: 0 },
    average_team_score: { type: Number, default: 0 },
    average_event_completion_rate: { type: Number, default: 0 },
    
    total_clock_in_overrides_issued: { type: Number, default: 0 },
    total_emergency_funds_requested: { type: Number, default: 0 },
    average_emergency_fund_amount: { type: Number, default: 0 },
    events_with_fraud_flags: { type: Number, default: 0 },
    
    recommendation_accuracy: { type: Number, default: 0 },
    supervisor_rating: { type: Number, default: 0 },
    
    last_updated: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = mongoose.models.SupervisorRatingProfile || mongoose.model('SupervisorRatingProfile', supervisorRatingProfileSchema);

