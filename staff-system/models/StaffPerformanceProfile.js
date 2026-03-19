const mongoose = require('mongoose');

const staffPerformanceProfileSchema = new mongoose.Schema({
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, unique: true },
    
    total_events_completed: { type: Number, default: 0 },
    total_reviews_received: { type: Number, default: 0 },
    
    average_overall_score: { type: Number, default: 0 },
    average_punctuality: { type: Number, default: 0 },
    average_professionalism: { type: Number, default: 0 },
    average_teamwork: { type: Number, default: 0 },
    average_client_interaction: { type: Number, default: 0 },
    average_task_completion: { type: Number, default: 0 },
    
    would_rebook_percentage: { type: Number, default: 0 },
    
    highest_score_ever: { type: Number, default: 0 },
    lowest_score_ever: { type: Number, default: 0 },
    
    // improving, declining, stable
    score_trend: { type: String, enum: ['improving', 'declining', 'stable'], default: 'stable' },
    
    disciplinary_flags: [{
        reason: { type: String, required: true },
        date: { type: Date, default: Date.now },
        flagged_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    
    attendance_rate: { type: Number, default: null }, // Percentage of completed/finance_settled assignments attended
    
    last_review_date: { type: Date },
    last_updated: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = mongoose.models.StaffPerformanceProfile || mongoose.model('StaffPerformanceProfile', staffPerformanceProfileSchema);

