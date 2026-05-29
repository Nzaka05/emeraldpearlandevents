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
    needUshers: {
        type: String,
        enum: ['Yes', 'No', 'Not specified'],
        default: 'Not specified'
    },
    usherCount: {
        type: Number,
        default: null
    },
    notes: {
        type: String,
        default: ''
    },
    adminNotes: [{
        note: String,
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin'
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],
    assignedStaff: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
    }],
    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff',
        default: null
    },
    staffNotified48hr: {
        type: Boolean,
        default: false
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    amountPaid: {
        type: Number,
        default: 0
    },
    // Idempotency metadata for payment/callback dedupe safety.
    paymentIdempotencyKey: {
        type: String,
        default: null
    },
    lastMpesaTransactionId: {
        type: String,
        default: null
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
    paymentMethod: {
        type: String,
        enum: ['mpesa', 'stripe', 'paystack', 'cash', 'pending'],
        default: 'pending'
    },
    stripeSessionId: {
        type: String,
        default: null
    },
    paystackReference: {
        type: String,
        default: null
    },
    paidAt: {
        type: Date,
        default: null
    },
    // ── Phase 1: Sync status tracking ─────────────────────────────────────────
    // Tracks whether this booking has been successfully synced to the staff portal.
    // The reconciliation cron queries for 'pending'/'failed' records and retries.
    syncStatus: {
        type: String,
        enum: ['pending', 'synced', 'failed'],
        default: 'pending'
    },
    syncAttempts: {
        type: Number,
        default: 0
    },
    lastSyncAttempt: {
        type: Date,
        default: null
    },
    lastSyncError: {
        type: String,
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
BookingSchema.pre('save', function (next) {
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
// ── Phase 1 & 4: Compound indexes for real query patterns ─────────────────────
BookingSchema.index({ status: 1, eventDate: -1 });
BookingSchema.index({ syncStatus: 1, lastSyncAttempt: 1 }); // for reconciliation cron
BookingSchema.index({ createdAt: -1 });                      // for dashboard sort
BookingSchema.index({ customerId: 1, status: 1 }); // client portal booking history (customerId + status)
BookingSchema.index({ paymentIdempotencyKey: 1 });            // payment dedupe lookups

// ── Phase 4: Removed global auto-populate ────────────────────────────────────
// The previous pre(/^find/) hook populated 'customerId' on EVERY query, including
// dashboard lists and cron scans that don't need it. Use explicit .populate()
// only where the customer data is actually required.
// Example: Booking.findById(id).populate('customerId', 'name email phone')

module.exports = mongoose.model('Booking', BookingSchema);
