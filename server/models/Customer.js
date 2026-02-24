const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// CUSTOMER SCHEMA FOR CRM
// ═══════════════════════════════════════════════════════════

const CustomerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        unique: true,
        sparse: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    phone: {
        type: String,
        required: true,
        unique: true,
        sparse: true,
        trim: true
    },
    firstContactDate: {
        type: Date,
        default: Date.now
    },
    lastContactDate: {
        type: Date,
        default: Date.now
    },
    tags: {
        type: [String],
        enum: ['new', 'returning', 'VIP', 'interested', 'inactive'],
        default: ['new']
    },
    bookingHistory: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Booking',
        default: []
    },
    preferredServices: {
        type: [String],
        default: []
    },
    notes: {
        type: String,
        default: ''
    },
    totalBookings: {
        type: Number,
        default: 0
    },
    totalSpend: {
        type: Number,
        default: 0
    },
    contactPreference: {
        type: String,
        enum: ['email', 'phone', 'whatsapp'],
        default: 'whatsapp'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Pre-save middleware to update lastContactDate
CustomerSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for faster queries
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ tags: 1 });

module.exports = mongoose.model('Customer', CustomerSchema);
