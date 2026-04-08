/**
 * Bookings Controller
 * Request/response handling only — all business logic delegated to service
 */

const respond = require('../../utils/respond');

const servicePath = './bookings.service';
const service = require(servicePath);

class BookingsController {
  /**
   * GET /api/admin/bookings - List all bookings
   */
  async list(req, res) {
    try {
      const { status, eventType, search, clientEmail, clientPhone, page = 1, limit = 20 } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (eventType) filters.eventType = eventType;
      if (clientEmail) filters.clientEmail = clientEmail;
      if (clientPhone) filters.clientPhone = clientPhone;
      if (search) filters.search = search;

      const result = await service.getAllRecords(filters, parseInt(page), parseInt(limit));

      respond(res, 200, {
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error fetching bookings:', error);
      respond(res, 500, {
        success: false,
        message: 'Error fetching bookings'
      });
    }
  }

  /**
   * GET /api/admin/bookings/:id - Get single booking
   */
  async getById(req, res) {
    try {
      const booking = await service.getRecordById(req.params.id);

      if (!booking) {
        return respond(res, 404, {
          success: false,
          message: 'Booking not found'
        });
      }

      respond(res, 200, {
        success: true,
        booking
      });
    } catch (error) {
      console.error('Error fetching booking:', error);
      respond(res, 500, {
        success: false,
        message: 'Error fetching booking'
      });
    }
  }

  /**
   * PATCH /api/admin/bookings/:id - Update booking
   */
  async update(req, res) {
    try {
      const { status, isPaid, notes, assignedStaff } = req.body;
      
      const updatedBooking = await service.updateRecord(
        req.params.id,
        { status, isPaid, notes, assignedStaff },
        req.admin.adminId
      );

      if (!updatedBooking) {
        return respond(res, 404, {
          success: false,
          message: 'Booking not found'
        });
      }

      // If status changed to confirmed and queued, notify
      if (updatedBooking.status === 'confirmed' && process.env.QUEUE_MODE === 'async') {
        return respond(res, 200, {
          success: true,
          message: 'Booking updated and queued for confirmation workflow',
          booking: updatedBooking
        });
      }

      respond(res, 200, {
        success: true,
        message: 'Booking updated',
        booking: updatedBooking
      });
    } catch (error) {
      console.error('Error updating booking:', {
        name: error.name,
        message: error.message,
        errors: error.errors,
        stack: error.stack
      });
      respond(res, 500, {
        success: false,
        message: 'Error updating booking'
      });
    }
  }

  /**
   * PATCH /api/admin/bookings/:id/pay - Update payment status
   */
  async updatePayment(req, res) {
    try {
      const { amountPaid, isPaid } = req.body;
      
      const booking = await service.updatePaymentStatus(
        req.params.id,
        amountPaid,
        isPaid
      );

      if (!booking) {
        return respond(res, 404, {
          success: false,
          message: 'Booking not found'
        });
      }

      respond(res, 200, {
        success: true,
        message: 'Payment details updated successfully',
        booking
      });
    } catch (error) {
      console.error('Error processing payment:', error);
      respond(res, 500, {
        success: false,
        message: 'Error processing payment'
      });
    }
  }

  /**
   * POST /api/admin/bookings/:id/payment - Record payment
   */
  async recordPayment(req, res) {
    try {
      const { amount, paymentMethod, transactionId, paymentDate, notes } = req.body;
      
      const result = await service.recordPayment(
        req.params.id,
        { amount, paymentMethod, transactionId, paymentDate, notes },
        req.admin.adminId
      );

      if (!result) {
        return respond(res, 404, {
          success: false,
          message: 'Booking not found'
        });
      }

      respond(res, 200, {
        success: true,
        message: 'Payment recorded successfully',
        payment: result.payment,
        booking: result.booking
      });
    } catch (error) {
      console.error('Error recording payment:', error);
      respond(res, 500, {
        success: false,
        message: 'Error recording payment'
      });
    }
  }

  /**
   * POST /api/admin/bookings/:id/send-appreciation - Send appreciation email
   */
  async sendAppreciation(req, res) {
    try {
      const booking = await service.sendAppreciationEmail(
        req.params.id,
        req.admin.adminId
      );

      if (!booking) {
        return respond(res, 404, {
          success: false,
          message: 'Booking not found'
        });
      }

      respond(res, 200, {
        success: true,
        message: 'Appreciation email sent successfully!'
      });
    } catch (error) {
      console.error('Error sending appreciation email:', error);
      respond(res, 500, {
        success: false,
        message: 'Failed to send appreciation email. Ensure SMTP is configured.'
      });
    }
  }

  /**
   * POST /api/admin/bookings/:id/message-staff - Send feedback request
   */
  async messageStaff(req, res) {
    try {
      const { customMessage, staffIds } = req.body;

      if (!customMessage || !staffIds || !staffIds.length) {
        return respond(res, 400, {
          success: false,
          message: 'Message and selected staff are required.'
        });
      }

      const result = await service.sendStaffFeedbackRequest(
        req.params.id,
        staffIds,
        customMessage,
        req.admin.adminId
      );

      if (result.successCount === 0) {
        return respond(res, 400, {
          success: false,
          message: 'Failed to send emails. Selected staff might not have valid email addresses.'
        });
      }

      respond(res, 200, {
        success: true,
        message: `Sent successfully to ${result.successCount} staff member(s). ${result.failCount > 0 ? `Failed for ${result.failCount}.` : ''}`
      });
    } catch (error) {
      console.error('Error messaging staff:', error);
      respond(res, 500, {
        success: false,
        message: 'Server error processing staff messages.'
      });
    }
  }

  /**
   * DELETE /api/admin/bookings/:id - Delete booking
   */
  async delete(req, res) {
    try {
      const booking = await service.deleteRecord(req.params.id);

      if (!booking) {
        return respond(res, 404, {
          success: false,
          message: 'Booking not found'
        });
      }

      respond(res, 200, {
        success: true,
        message: 'Booking deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting booking:', error);
      respond(res, 500, {
        success: false,
        message: 'Error deleting booking'
      });
    }
  }
}

module.exports = new BookingsController();
