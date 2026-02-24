const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// ANALYTICS SCHEMA
// ═══════════════════════════════════════════════════════════

const AnalyticsSchema = new mongoose.Schema({
    eventType: {
        type: String,
        enum: ['form_submission', 'whatsapp_click', 'service_selection', 'page_view', 'booking_confirmed', 'budget_selected'],
        required: true
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },
    userAgent: {
        type: String,
        default: null
    },
    ipAddress: {
        type: String,
        default: null
    },
    referrer: {
        type: String,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, { timestamps: false });

// Index for aggregation queries
AnalyticsSchema.index({ eventType: 1, timestamp: 1 });

module.exports = mongoose.model('Analytics', AnalyticsSchema);
