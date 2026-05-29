const mongoose = require('mongoose');

const StaffSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    email: {
        type: String,
        default: null
    },
    whatsapp: {
        type: String,
        default: null
    },
    photo: {
        type: String,
        default: null
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    assignedBookings: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
        }
    ],
    hourlyRate: {
        type: Number,
        default: 0
    },
    notes: {
        type: String,
        default: ''
    },
    password: {
        type: String,
        default: null
    },
    role: {
        type: String,
        enum: ['Admin', 'Supervisor', 'Staff'],
        default: 'Staff'
    },
    status: {
        type: String,
        enum: ['Active', 'Suspended'],
        default: 'Active'
    },
    mustChangePassword: {
        type: Boolean,
        default: true
    },
    tokenVersion: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ── Compound indexes for real query patterns ─────────────────────────────────
StaffSchema.index({ category: 1, isAvailable: 1 });  // active staff by category queries
StaffSchema.index({ assignedBookings: 1 });           // event roster lookups
StaffSchema.index({ assignedBookings: 1, isAvailable: 1 }); // roster + availability filters

module.exports = mongoose.model('Staff', StaffSchema);
