const mongoose = require('mongoose');

// SharedClientETR — reads from the same collection as the legacy ClientETR model
const clientEtrSchema = new mongoose.Schema({
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
    generated_at: { type: Date, default: Date.now },
    generated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    pdf_url: { type: String },
    summary: { type: mongoose.Schema.Types.Mixed },
    delivery_status: { 
        type: String, 
        enum: ['pending', 'sent', 'delivered', 'failed'], 
        default: 'pending' 
    },
    sent_at: { type: Date },
    opened_at: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('ClientETR', clientEtrSchema);
