/**
 * Bookings Repository
 * All Mongoose queries for Booking model — NO business logic
 */

const Booking = require('../../server/models/Booking');
const Customer = require('../../server/models/Customer');
const ClientPayment = require('../../server/models/ClientPayment');
const Staff = require('../../server/models/Staff');
const { DEFAULT_PAGE_SIZE } = require('../../utils/constants');

const DEFAULT_LIST_PROJECTION = {
  syncAttempts: 0,
  lastSyncError: 0,
  __v: 0,
  notes: 0,
  adminNotes: 0,
  selectedServices: 0,
  paymentIdempotencyKey: 0
};

class BookingsRepository {
  /**
   * Find all bookings with filters and pagination
   */
  async findAll({ page = 1, limit = DEFAULT_PAGE_SIZE, ...query }) {
    const parsedPage = Math.floor(Number(page));
    const parsedLimit = Math.floor(Number(limit));
    const safePage = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? parsedLimit : DEFAULT_PAGE_SIZE;
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      Booking.find(query, DEFAULT_LIST_PROJECTION)
        .populate('customerId', 'name email phone')
        .populate('assignedStaff')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      Booking.countDocuments(query)
    ]);

    return { items, total, page: safePage, limit: safeLimit };
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

  /**
   * Assign supervisor and staff to a booking
   */
  async assignStaff(bookingId, { supervisorId, staffIds }) {
    const booking = await Booking.findById(bookingId);
    if (!booking) return null;

    if (supervisorId !== undefined) booking.supervisor = supervisorId || null;
    if (staffIds !== undefined) booking.assignedStaff = staffIds;

    await booking.save();
    return booking;
  }

  /**
   * Find staff members by array of IDs (for notification text)
   */
  async findStaffByIds(ids, selectFields = 'name') {
    if (!ids || !ids.length) return [];
    return await Staff.find({ _id: { $in: ids } }).select(selectFields);
  }

  /**
   * Find a single staff member by ID
   */
  async findStaffById(staffId, selectFields = 'name') {
    return await Staff.findById(staffId).select(selectFields);
  }
}

module.exports = new BookingsRepository();
