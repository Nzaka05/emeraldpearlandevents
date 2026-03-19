const mongoose = require('mongoose');

const performanceReviewSchema = new mongoose.Schema({
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    
    punctuality_rating: { type: Number, required: true, min: 1, max: 5 },
    professionalism_rating: { type: Number, required: true, min: 1, max: 5 },
    teamwork_rating: { type: Number, required: true, min: 1, max: 5 },
    client_interaction_rating: { type: Number, required: true, min: 1, max: 5 },
    task_completion_rating: { type: Number, required: true, min: 1, max: 5 },
    
    overall_score: { type: Number, required: true }, // Calculated via pre-save hook
    
    comments: { type: String, default: '' },
    strengths: [{ type: String }],
    improvement_areas: [{ type: String }],
    would_rebook: { type: Boolean, required: true },
    
    submitted_at: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// Enforce one review per staff member per event
performanceReviewSchema.index({ event_id: 1, staff_id: 1 }, { unique: true });

performanceReviewSchema.pre('validate', async function() {
    if (
        this.punctuality_rating &&
        this.professionalism_rating &&
        this.teamwork_rating &&
        this.client_interaction_rating &&
        this.task_completion_rating
    ) {
        // Calculate weighted score — server-enforced, never manually overridable
        const score =
            (this.punctuality_rating   * 0.20) +
            (this.professionalism_rating * 0.25) +
            (this.teamwork_rating        * 0.20) +
            (this.client_interaction_rating * 0.20) +
            (this.task_completion_rating * 0.15);
        this.overall_score = Math.round(score * 100) / 100;
    }
});

module.exports = mongoose.models.PerformanceReview || mongoose.model('PerformanceReview', performanceReviewSchema);

