const mongoose = require('mongoose');

/**
 * Survey — Post-event feedback collection (Phase 11)
 * Supports Staff, Supervisor, and Client survey types
 */
const surveySchema = new mongoose.Schema({
    type: { 
        type: String, 
        enum: ['Staff', 'Supervisor', 'Client'], 
        required: true 
    },
    assignment_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    respondent_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null }, // null for client surveys
    respondent_name:{ type: String, default: '' },
    responses: [{
        question:    { type: String, required: true },
        answer:      { type: mongoose.Schema.Types.Mixed }, // String, Number, or Array
        answer_type: { type: String, enum: ['text', 'rating', 'multiple_choice', 'boolean'] }
    }],
    overall_rating: { type: Number, min: 1, max: 5, default: null },
    submitted:      { type: Boolean, default: false },
    submitted_at:   { type: Date, default: null },
    token:          { type: String, unique: true, sparse: true } // for client survey links
}, { timestamps: true });

surveySchema.index({ assignment_id: 1, type: 1 });
surveySchema.index({ respondent_id: 1, submitted: 1 });

module.exports = mongoose.models.Survey || mongoose.model('Survey', surveySchema);

