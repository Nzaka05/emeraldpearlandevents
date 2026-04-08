/**
 * Bookings Repository
 * All Mongoose queries for Booking model — NO business logic
 */

const Booking = require('../../server/models/Booking');
const Customer = require('../../server/models/Customer');
const ClientPayment = require('../../server/models/ClientPayment');

class BookingsRepository {
  /**
   * Find all bookings with filters and pagination
   */
  async findAll(query, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const bookings = await Booking.find(query)
      .populate('customerId')
      .populate('assignedStaff')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    return {
      bookings,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page)
      }
    };
  }

  /**
   * Find booking by ID with full population
   */
  async findById(bookingId) {
    return await Booking.findById(bookingId)
      .populate('customerId')
      .populate('assignedStaff')
      .populate('adminNotes.addedBy', 'name');
  }

  /**
   * Update booking with given payload
   */
  async updateById(bookingId, updatePayload) {
    return await Booking.findByIdAndUpdate(
      bookingId,
      updatePayload,
      {
        new: true,
        runValidators: true
      }
    );
  }

  /**
   * Update payment fields (amountPaid, isPaid)
   */
  async updatePayment(bookingId, amountPaid, isPaid) {
    const booking = await Booking.findById(bookingId);
    if (!booking) return null;

    if (amountPaid !== undefined) {
      booking.amountPaid = Number(amountPaid);
    }
    if (isPaid !== undefined) {
      booking.isPaid = isPaid;
    }

    await booking.save();
    return booking;
  }

  /**
   * Update sync status after confirmation workflow
   */
  async updateSyncStatus(bookingId, status, error = null) {
    const updatePayload = {
      syncStatus: status,
      lastSyncAttempt: new Date(),
      $inc: { syncAttempts: 1 }
    };

    if (error) {
      updatePayload.lastSyncError = error;
    } else {
      updatePayload.$unset = { lastSyncError: 1 };
    }

    return await Booking.findByIdAndUpdate(bookingId, updatePayload);
  }

  /**
   * Add admin note to booking
   */
  async addAdminNote(bookingId, note, adminId) {
    return await Booking.findByIdAndUpdate(
      bookingId,
      {
        $push: {
          adminNotes: {
            note,
            addedBy: adminId
          }
        }
      },
      { new: true }
    );
  }

  /**
   * Delete booking by ID
   */
  async deleteById(bookingId) {
    return await Booking.findByIdAndDelete(bookingId);
  }

  /**
   * Create payment record
   */
  async createPayment(paymentData) {
    return await ClientPayment.create(paymentData);
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId) {
    return await Customer.findById(customerId);
  }
}

module.exports = new BookingsRepository();
