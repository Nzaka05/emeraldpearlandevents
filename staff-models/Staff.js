const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Supervisor', 'Staff'], default: 'Staff' },
    shift_start: { type: String }, // e.g., '09:00'
    shift_end: { type: String },   // e.g., '17:00'
    phone: { type: String },
    department: { type: String },
    skills: [{ type: String }],
    photo_url: { type: String },
    status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
    mustChangePassword: { type: Boolean, default: true },
    resetPasswordToken: { type: String },
    resetPasswordExpire: { type: Date },
    availability_status: {
        type: String,
        enum: ['Available', 'Busy', 'Not Available', 'On Leave'],
        default: 'Available'
    },
    pushSubscription: { type: Object },
    secureLoginToken: { type: String },
    secureLoginExpire: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Staff || mongoose.models.Staff || mongoose.model('Staff', staffSchema);

