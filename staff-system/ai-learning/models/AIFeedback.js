const mongoose = require('mongoose');

const aiFeedbackSchema = new mongoose.Schema({
    event_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Assignment',
        required: false 
    },
    prediction_id: { // Optional, if you store individual predictions
        type: String,
        required: false
    },
    marked_accurate: { 
        type: Boolean, 
        required: true 
    },
    comments: { 
        type: String 
    },
    feedback_by: { 
        type: mongoose.Schema.Types.ObjectId, // Admin or Supervisor ID
        required: true 
    }
}, { timestamps: true });

module.exports = mongoose.model('AIFeedback', aiFeedbackSchema);
