const mongoose = require('mongoose');

const eventPerformanceBaselineSchema = new mongoose.Schema({
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, unique: true },
    snapshot_taken_at: { type: Date, default: Date.now },
    assigned_staff_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    staff_performance_scores_at_time: {
        type: Map,
        of: Number // Maps staff_id strings to average_overall_score at completion
    },
    supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    supervisor_rating_at_time: { type: Number, default: null },
    review_window_extended_until: { type: Date, default: null },
    notes: { type: String, default: 'pre-review baseline' }
}, {
    timestamps: true
});

module.exports = mongoose.models.EventPerformanceBaseline || mongoose.model('EventPerformanceBaseline', eventPerformanceBaselineSchema);

