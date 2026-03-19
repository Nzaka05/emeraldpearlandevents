const mongoose = require('mongoose');

const EventPredictionSnapshotSchema = new mongoose.Schema({
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    predictedStaff: { type: Number, required: true },
    estimatedCost: { type: Number, required: true },
    estimatedProfit: { type: Number, default: null },
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
    confidenceScore: { type: Number, required: true, min: 0, max: 1 },
    recommendations: [{ type: String }],
    dataQuality: {
        hasBooking: { type: Boolean, default: false },
        hasInvoice: { type: Boolean, default: false },
        hasReviews: { type: Boolean, default: false },
        historicalEventsUsed: { type: Number, default: 0 }
    },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    generatedAt: { type: Date, default: Date.now }
});

EventPredictionSnapshotSchema.index({ assignmentId: 1, generatedAt: -1 });

module.exports = mongoose.models.EventPredictionSnapshot ||
    mongoose.model('EventPredictionSnapshot', EventPredictionSnapshotSchema);
