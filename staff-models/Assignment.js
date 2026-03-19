const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    date: { type: Date, required: true },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    pay_rate: { type: Number, required: true },
    vip_flag: { type: Boolean, default: false },
    special_instructions: { type: String },
    dress_code: { type: String },
    assigned_staff_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    accepted_staff_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    declined_staff_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
    status: { type: String, enum: ['Active', 'Completed', 'Cancelled'], default: 'Active' },
    payment_status: { type: String, enum: ['Pending', 'Sent', 'Received', 'Disputed'], default: 'Pending' },
    payment_confirmed_at: { type: Date }, // When staff confirms payment received
    payment_disputed_reason: { type: String }, // Reason for dispute if payment is disputed
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Assignment || mongoose.model('Assignment', assignmentSchema);
