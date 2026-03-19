const mongoose = require('mongoose');

const performanceReviewSchema = new mongoose.Schema({
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    feedback: { type: String },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.models.PerformanceReview || mongoose.model('PerformanceReview', performanceReviewSchema);
