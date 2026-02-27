const mongoose = require('mongoose');

const AdminNotificationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['new_booking', 'upcoming_event', 'follow_up_due', 'system', 'payment_received', 'staff_assigned', 'payment'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    bookingRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },
    icon: {
        type: String,
        default: 'bell'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    action: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto expire notifications after 30 days
AdminNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('AdminNotification', AdminNotificationSchema);
