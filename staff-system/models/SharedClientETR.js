const mongoose = require('mongoose');
const sharedClientETRSchema = new mongoose.Schema({
    booking_id: mongoose.Schema.Types.ObjectId,
    client_email: String,
    client_name: String,
    event_type: String,
    event_date: Date,
    total_amount: Number,
    status: String,
    createdAt: Date
}, { collection: 'clientetrs', strict: false });
module.exports = mongoose.models.SharedClientETR || mongoose.model('SharedClientETR', sharedClientETRSchema);
