const mongoose = require('mongoose');

const aiTrainingLogSchema = new mongoose.Schema({
    event_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Assignment',
        required: true,
        unique: true // Ensures exact-once processing per event
    },
    processed_at: { 
        type: Date, 
        default: Date.now 
    },
    status: { 
        type: String, 
        enum: ['Processing', 'Success', 'Failed'], 
        required: true 
    },
    details: { 
        type: mongoose.Schema.Types.Mixed,
        default: {} 
    }
}, { timestamps: true });

module.exports = mongoose.model('AITrainingLog', aiTrainingLogSchema);
