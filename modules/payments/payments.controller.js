/**
 * Payments Controller
 * Request/response handling only — all business logic delegated to service
 * Queue dispatch stays here (it's I/O, not business logic)
 */

const respond = require('../../utils/respond');

const servicePath = './payments.service';
const service = require(servicePath);
const queues = require('../../config/queues');
const paymentQueue = queues.paymentQueue;

const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();

class PaymentsController {
  /**
   * GET /api/admin/payments - List all payments
   */
  async list(req, res) {
    try {
      const { payment_status, start_date, end_date, staff_id, page = 1, limit = 20 } = req.query;

      const filters = {};
      if (payment_status) filters.payment_status = payment_status;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (staff_id) filters.staff_id = staff_id;

      const result = await service.getAllPayments(filters, parseInt(page), parseInt(limit));

      respond(res, 200, {
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error fetching payments:', error);
      respond(res, 500, {
        success: false,
        message: 'Error fetching payments'
      });
    }
  }

  /**
   * GET /api/admin/payments/:id - Get single payment
   */
  async getById(req, res) {
    try {
      const payment = await service.getPaymentById(req.params.id);

      if (!payment) {
        return respond(res, 404, {
          success: false,
          message: 'Payment not found'
        });
      }

      respond(res, 200, {
        success: true,
        payment
      });
    } catch (error) {
      console.error('Error fetching payment:', error);
      respond(res, 500, {
        success: false,
        message: 'Error fetching payment'
      });
    }
  }

  /**
   * POST /api/admin/payments/stk-push - Initiate STK push
   */
  async initiateStk(req, res) {
    try {
      const { phoneNumber, amount, accountReference, description } = req.body;

      if (!phoneNumber || !amount) {
        return respond(res, 400, {
          success: false,
          message: 'Phone number and amount are required'
        });
      }

      const result = await service.initiateStkPush(
        phoneNumber,
        amount,
        accountReference,
        description
      );

      respond(res, 200, {
        success: true,
        message: 'STK push initiated',
        data: result
      });
    } catch (error) {
      console.error('Error initiating STK push:', error);
      respond(res, 500, {
        success: false,
        message: 'Error initiating STK push'
      });
    }
  }

  /**
   * POST /api/admin/payments/mpesa/callback - M-Pesa callback (public, no auth)
   */
  async mpesaCallback(req, res) {
    try {
      const payload = {
        ...req.body,
        idempotencyKey: req.headers['x-idempotency-key'] || req.body?.idempotencyKey
      };

      const result = payload?.Result;
      if (!result || typeof result !== 'object' || !result.Occasion) {
        console.warn('M-Pesa callback invalid payload ignored');
        return respond(res, 200, { success: true, ignored: true });
      }

      // Queue or process inline
      if (queueMode === 'async') {
        await paymentQueue.add('mpesa.callback', { payload });
      } else {
        await service.processMpesaCallback(payload);
      }

      respond(res, 200, { success: true });
    } catch (error) {
      console.error('M-Pesa callback error:', error.message);
      respond(res, 200, { success: true }); // Always 200 to Safaricom
    }
  }

  /**
   * POST /api/admin/payments/mpesa/timeout - M-Pesa timeout (public, no auth)
   */
  async mpesaTimeout(req, res) {
    try {
      console.warn('M-Pesa B2C timeout:', req.body);
      respond(res, 200, { success: true });
    } catch (error) {
      console.error('M-Pesa timeout handler error:', error);
      respond(res, 200, { success: true });
    }
  }

  /**
   * GET /api/admin/payments/status/:conversationId - Check transaction status
   */
  async checkStatus(req, res) {
    try {
      const { conversationId } = req.params;

      if (!conversationId) {
        return respond(res, 400, {
          success: false,
          message: 'Conversation ID is required'
        });
      }

      const status = await service.checkTransactionStatus(conversationId);

      respond(res, 200, {
        success: true,
        status
      });
    } catch (error) {
      console.error('Error checking transaction status:', error);
      respond(res, 500, {
        success: false,
        message: 'Error checking transaction status'
      });
    }
  }

  /**
   * PUT /api/admin/payments/:id/status - Update payment status
   */
  async updateStatus(req, res) {
    try {
      const { status, updateData } = req.body;

      if (!status) {
        return respond(res, 400, {
          success: false,
          message: 'Payment status is required'
        });
      }

      const payment = await service.updatePaymentStatus(
        req.params.id,
        status,
        updateData || {}
      );

      if (!payment) {
        return respond(res, 404, {
          success: false,
          message: 'Payment not found'
        });
      }

      respond(res, 200, {
        success: true,
        message: 'Payment status updated',
        payment
      });
    } catch (error) {
      console.error('Error updating payment status:', error);
      respond(res, 500, {
        success: false,
        message: 'Error updating payment status'
      });
    }
  }

  /**
   * PUT /api/admin/payments/:assignmentId/mark-received/:staffPaymentId - Mark payment as received
   */
  async markReceived(req, res) {
    try {
      const { assignmentId, staffPaymentId } = req.params;

      const assignment = await service.markPaymentReceived(assignmentId, staffPaymentId);

      if (!assignment) {
        return respond(res, 404, {
          success: false,
          message: 'Assignment not found'
        });
      }

      respond(res, 200, {
        success: true,
        message: 'Payment marked as received',
        assignment
      });
    } catch (error) {
      console.error('Error marking payment as received:', error);
      respond(res, 500, {
        success: false,
        message: 'Error marking payment as received'
      });
    }
  }
}

module.exports = new PaymentsController();
