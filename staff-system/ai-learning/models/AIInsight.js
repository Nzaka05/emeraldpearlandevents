const mongoose = require('mongoose');

const aiInsightSchema = new mongoose.Schema({
    type: { 
        type: String, 
        enum: ['global', 'event-type', 'client', 'staff', 'finance'], 
        required: true 
    },
    reference_id: { 
        type: String, // Can be 'GLOBAL', an event_type string, or an ObjectId string
        required: true 
    },
    metrics: { 
        type: mongoose.Schema.Types.Mixed,
        default: {} 
    },
    anomalies: [{
        metric: String,
        description: String,
        detected_at: Date
    }],
    model_version: { 
        type: String, 
        default: '1.0.0' 
    },
    sample_size: { 
        type: Number, 
        default: 0 
    },
    confidence: { 
        type: Number, // 0 to 100
        default: 0 
    },
    last_updated: { 
        type: Date, 
        default: Date.now 
    }
}, { timestamps: true });

// Compound index for quick lookups
aiInsightSchema.index({ type: 1, reference_id: 1, model_version: 1 }, { unique: true });

module.exports = mongoose.model('AIInsight', aiInsightSchema);
