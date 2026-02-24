const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// BOOKING SCHEMA
// ═══════════════════════════════════════════════════════════

const BookingSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    eventType: {
        type: String,
        enum: ['Wedding', 'Anniversary', 'Birthday Party', 'Family & House Party', 'Traditional Ceremony', 'Memorial Service', 'Corporate Event', 'Brand Ambassador Event', 'Product Launch', 'Private Celebration', 'Luxury Decor & Styling', 'Other'],
        required: true
    },
    eventDate: {
        type: Date,
        required: true
    },
    eventDuration: {
        type: String,
        required: true
    },
    location: {
        type: String,
        required: true,
        trim: true
    },
    guests: {
        type: Number,
        required: true,
        min: 1
    },
    budgetRange: {
        type: String,
        enum: ['Under KES 50,000', 'KES 50,000 – 100,000', 'KES 100,000 – 250,000', 'KES 250,000 – 500,000', 'KES 500,000+', 'Not Sure Yet'],
        required: true
    },
    selectedServices: [{
        serviceName: String,
        quantity: {
            type: Number,
            default: 1
        },
        estimatedCost: {
            type: Number,
            default: 0
        }
    }],
    notes: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['new', 'contacted', 'confirmed', 'completed', 'cancelled'],
        default: 'new'
    },
    estimatedTotal: {
        type: Number,
        default: 0
    },
    bookingReference: {
        type: String,
        unique: true,
        sparse: true
    },
    emailSentAt: {
        type: Date,
        default: null
    },
    followUpEmailSentAt: {
        type: Date,
        default: null
    },
    reminderEmailSentAt: {
        type: Date,
        default: null
    },
    confirmedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
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

// Generate booking reference before save
BookingSchema.pre('save', function(next) {
    if (!this.bookingReference) {
        this.bookingReference = `EPE-${Date.now()}`;
    }
    this.updatedAt = Date.now();
    next();
});

// Index for faster queries
BookingSchema.index({ customerId: 1 });
BookingSchema.index({ eventDate: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ createdAt: 1 });

// Populate customer by default
BookingSchema.pre(/^find/, function(next) {
    if (this.options._recursed) {
        return next();
    }
    this.populate({
        path: 'customerId',
        select: 'name email phone'
    });
    next();
});

module.exports = mongoose.model('Booking', BookingSchema);
