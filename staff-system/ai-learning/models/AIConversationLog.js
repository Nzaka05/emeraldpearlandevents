const mongoose = require('mongoose');

const aiConversationLogSchema = new mongoose.Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true 
    },
    role: { 
        type: String,
        required: true 
    },
    query: { 
        type: String, 
        required: true,
        maxlength: 2000
    },
    response: { 
        type: String, 
        required: true 
    },
    context_used: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true  // creates createdAt + updatedAt
});

// TTL index: auto-delete after 90 days
aiConversationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AIConversationLog', aiConversationLogSchema);
