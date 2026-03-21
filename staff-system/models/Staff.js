const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Supervisor', 'Staff'], default: 'Staff' },
    specific_role: { type: String, default: '' }, // e.g. Usher, Bartender, Security
    shift_start: { type: String }, // e.g., '09:00'
    shift_end: { type: String },   // e.g., '17:00'
    phone: { type: String },
    department: { type: String },
    skills: [{ type: String }],
    category: {
        type: String,
        enum: ['Usher', 'Brand Ambassador', 'Supervisor', 'Event Planner', 'Organiser', 'Wedding Planner', 'Ticketing Agent'],
        default: 'Usher'
    },
    photo_url: { type: String },
    status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
    mustChangePassword: { type: Boolean, default: true },
    title: { type: String, default: null },
    dualRole: { type: Boolean, default: false },
    availability_status: {
        type: String,
        enum: ['Available', 'Busy', 'Not Available', 'On Leave'],
        default: 'Available'
    },
    supervisor_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Staff', 
        default: null 
    },
    pushSubscription: { type: Object },
    secureLoginToken: { type: String },
    secureLoginExpire: { type: Date },
    last_location: {
        lat: { type: Number },
        lng: { type: Number },
        updatedAt: { type: Date }
    },
    createdAt: { type: Date, default: Date.now }
});

// Indexes for performance
staffSchema.index({ 'last_location': '2d' });
staffSchema.index({ role: 1, status: 1 });

module.exports = mongoose.models.Staff || mongoose.model('Staff', staffSchema);

