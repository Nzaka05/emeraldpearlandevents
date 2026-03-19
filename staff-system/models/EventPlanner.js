const mongoose = require('mongoose');

/**
 * EventPlanner — External contacts directory (Phase 7)
 * Stores event planners, wedding planners, corporate organisers etc.
 */
const eventPlannerSchema = new mongoose.Schema({
    name:    { type: String, required: true },
    company: { type: String, default: '' },
    phone:   { type: String, required: true },
    email:   { type: String, default: '' },
    event_types: [{ 
        type: String, 
        enum: ['Wedding', 'Corporate', 'Birthday', 'Concert', 'Conference', 
               'Exhibition', 'Sports', 'Private', 'Other'] 
    }],
    notes:    { type: String, default: '' },
    rating:   { type: Number, min: 1, max: 5, default: null },
    linked_assignments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' }],
    status:   { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdAt:{ type: Date, default: Date.now },
    updatedAt:{ type: Date, default: Date.now }
});

eventPlannerSchema.index({ name: 'text', company: 'text', email: 'text' });

module.exports = mongoose.model('EventPlanner', eventPlannerSchema);
