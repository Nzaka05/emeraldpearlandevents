const mongoose = require('mongoose');

const staffPerformanceSummarySchema = new mongoose.Schema({
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    total_events: { type: Number, default: 0 },
    avg_rating: { type: Number, default: 3.0 },
    reliability_score: { type: Number, default: 50 }, // 0–100
    attendance_rate: { type: Number, default: 100 },
    missed_events: { type: Number, default: 0 },
    late_count: { type: Number, default: 0 },
    last_updated: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('StaffPerformanceSummary', staffPerformanceSummarySchema);
