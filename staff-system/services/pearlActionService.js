/**
 * PEARL Action Service
 * Allows PEARL to perform real actions on the Emerald system
 */

const mongoose = require('mongoose');

async function getBookings(filter = {}) {
    const db = mongoose.connection.db;
    const query = {};
    if (filter.status) query.status = filter.status;
    if (filter.upcoming) query.eventDate = { $gte: new Date() };
    const bookings = await db.collection('bookings').find(query)
        .sort({ eventDate: 1 }).limit(20).toArray();
    return bookings.map(b => ({
        id: b._id.toString(),
        client: b.clientName || b.client_name,
        email: b.clientEmail || b.client_email,
        phone: b.clientPhone || b.client_phone,
        eventType: b.eventType || b.event_type,
        eventDate: b.eventDate,
        location: b.location,
        guests: b.guests,
        status: b.status,
        isPaid: b.isPaid,
        totalAmount: b.totalAmount,
        budgetRange: b.budgetRange
    }));
}

async function confirmBooking(bookingId) {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const result = await db.collection('bookings').updateOne(
        { _id: new ObjectId(bookingId) },
        { $set: { status: 'confirmed', updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
}

async function cancelBooking(bookingId, reason) {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const result = await db.collection('bookings').updateOne(
        { _id: new ObjectId(bookingId) },
        { $set: { status: 'cancelled', cancelReason: reason, updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
}

async function updateBookingStatus(bookingId, status) {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const result = await db.collection('bookings').updateOne(
        { _id: new ObjectId(bookingId) },
        { $set: { status, updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
}

async function getStaffList() {
    const Staff = require('../models/Staff');
    return await Staff.find({ status: 'Active' })
        .select('name category role availability_status title phone email')
        .lean();
}

async function updateStaffAvailability(staffId, availability) {
    const Staff = require('../models/Staff');
    const result = await Staff.updateOne(
        { _id: staffId },
        { $set: { availability_status: availability } }
    );
    return result.modifiedCount > 0;
}

async function getAnalytics() {
    const db = mongoose.connection.db;
    const [totalBookings, confirmedBookings, pendingBookings, cancelledBookings] = await Promise.all([
        db.collection('bookings').countDocuments(),
        db.collection('bookings').countDocuments({ status: 'confirmed' }),
        db.collection('bookings').countDocuments({ status: { $in: ['pending', 'new'] } }),
        db.collection('bookings').countDocuments({ status: 'cancelled' })
    ]);
    const revenue = await db.collection('bookings').aggregate([
        { $match: { isPaid: true } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]).toArray();
    const upcoming = await db.collection('bookings').find({
        eventDate: { $gte: new Date() },
        status: { $ne: 'cancelled' }
    }).sort({ eventDate: 1 }).limit(5).toArray();
    return {
        totalBookings, confirmedBookings, pendingBookings, cancelledBookings,
        totalRevenue: revenue[0]?.total || 0,
        upcomingEvents: upcoming.map(b => ({
            client: b.clientName || b.client_name,
            date: b.eventDate,
            type: b.eventType,
            status: b.status
        }))
    };
}

async function getClients() {
    const db = mongoose.connection.db;
    const clients = await db.collection('customers').find({})
        .sort({ createdAt: -1 }).limit(20).toArray();
    return clients.map(c => ({
        id: c._id.toString(),
        name: c.name || c.clientName,
        email: c.email,
        phone: c.phone,
        totalBookings: c.totalBookings || 0
    }));
}

module.exports = {
    getBookings,
    confirmBooking,
    cancelBooking,
    updateBookingStatus,
    getStaffList,
    updateStaffAvailability,
    getAnalytics,
    getClients
};
