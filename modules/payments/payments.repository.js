/**
 * Payments Repository
 * All Payment/Transaction model queries — NO business logic
 */

const Payment = require('../../server/models/ClientPayment');
let Transaction = null;
try {
  Transaction = require('../../server/models/Transaction');
} catch (e) {
  Transaction = null;
}
const Assignment = require('../../staff-system/models/Assignment');
const { DEFAULT_PAGE_SIZE } = require('../../utils/constants');

const PAYMENT_LIST_PROJECTION = {
  rawCallbackPayload: 0,
  __v: 0,
  notes: 0
};

const TRANSACTION_LIST_PROJECTION = {
  rawPayload: 0,
  notes: 0,
  internalLog: 0,
  __v: 0
};

const transactionFallbackStore = new Map();

class PaymentsRepository {
  /**
   * Find all payments with filters and pagination
   */
  async findAll(filterOrOptions = {}, pageArg = 1, limitArg = DEFAULT_PAGE_SIZE) {
    const useOptionsObject = filterOrOptions && typeof filterOrOptions === 'object' &&
      (Object.prototype.hasOwnProperty.call(filterOrOptions, 'page') ||
       Object.prototype.hasOwnProperty.call(filterOrOptions, 'limit'));

    const rawPage = useOptionsObject ? filterOrOptions.page : pageArg;
    const rawLimit = useOptionsObject ? filterOrOptions.limit : limitArg;
    const filter = useOptionsObject
      ? (({ page, limit, ...rest }) => rest)(filterOrOptions)
      : (filterOrOptions || {});

    const parsedPage = Math.floor(Number(rawPage));
    const parsedLimit = Math.floor(Number(rawLimit));
    const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? parsedLimit : DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Payment.find(filter, PAYMENT_LIST_PROJECTION)
        .populate('bookingId', 'bookingReference eventType eventDate')
        .populate('clientId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter)
    ]);

    const pages = Math.ceil(total / limit);

    return {
      items,
      payments: items,
      total,
      page,
      limit,
      pages,
      pagination: {
        currentPage: page,
        page,
        limit,
        total,
        pages
      }
    };
  }

  /**
   * Find payment by ID
   */
  async findById(paymentId) {
    return await Payment.findById(paymentId)
      .populate('bookingId')
      .populate('clientId');
  }

  /**
   * Create or update transaction
   */
  async upsertTransaction(transactionData) {
    if (Transaction) {
      return await Transaction.findOneAndUpdate(
        { transactionId: transactionData.transactionId },
        transactionData,
        { upsert: true, new: true }
      );
    }

    transactionFallbackStore.set(transactionData.transactionId, {
      ...transactionData,
      updatedAt: new Date()
    });
    return transactionFallbackStore.get(transactionData.transactionId);
  }

  /**
   * Find transaction by ID
   */
  async findTransaction(transactionId) {
    if (Transaction) {
      return await Transaction.findOne({ transactionId });
    }
    return transactionFallbackStore.get(transactionId) || null;
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(paymentId, status, updateData = {}) {
    return await Payment.findByIdAndUpdate(
      paymentId,
      {
        status,
        ...updateData,
        updatedAt: new Date()
      },
      { new: true }
    );
  }

  /**
   * Create payment record
   */
  async createPayment(paymentData) {
    return await Payment.create(paymentData);
  }

  /**
   * Find assignment and update payment status
   */
  async findAssignmentAndUpdatePayment(assignmentId, paymentData) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return null;

    // Update the staff_payments array
    if (paymentData.staffId && paymentData.status) {
      const paymentIndex = assignment.staff_payments?.findIndex(
        p => p.staff_id?.toString() === paymentData.staffId.toString()
      );
      
      if (paymentIndex !== undefined && paymentIndex !== -1) {
        assignment.staff_payments[paymentIndex].payment_status = paymentData.status;
        if (paymentData.transactionId) {
          assignment.staff_payments[paymentIndex].transactionId = paymentData.transactionId;
        }
      }
    }

    await assignment.save();
    return assignment;
  }

  /**
   * Mark payment as received by staff
   */
  async markPaymentReceived(assignmentId, staffPaymentId) {
    return await Assignment.findByIdAndUpdate(
      assignmentId,
      {
        $set: {
          'staff_payments.$[elem].mark_received': true,
          'staff_payments.$[elem].received_date': new Date()
        }
      },
      {
        arrayFilters: [{ 'elem._id': staffPaymentId }],
        new: true
      }
    );
  }

  /**
   * Find all transactions by type
   */
  async findTransactionsByType(type, filter = {}) {
    if (Transaction) {
      return await Transaction.find({
        type,
        ...filter
      })
      .select(TRANSACTION_LIST_PROJECTION)
      .sort({ createdAt: -1 });
    }

    return Array.from(transactionFallbackStore.values())
      .filter(t => t.type === type)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
}

module.exports = new PaymentsRepository();
