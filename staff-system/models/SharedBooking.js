const mongoose = require('mongoose');
// Lightweight read-only schema for reading from the shared bookings collection
const sharedBookingSchema = new mongoose.Schema({
    clientName: String,
    clientEmail: String,
    clientPhone: String,
    eventType: String,
    eventDate: Date,
    location: String,
    guestCount: Number,
    status: String,
    totalAmount: Number,
    createdAt: Date
}, { collection: 'bookings', strict: false });
module.exports = mongoose.models.SharedBooking || mongoose.model('SharedBooking', sharedBookingSchema);
