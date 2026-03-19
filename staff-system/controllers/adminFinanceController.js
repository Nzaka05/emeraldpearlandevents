/**
 * adminFinanceController.js
 * Domain: Payments, M-Pesa, Ledger
 * Pattern: Thin controller — delegates all financial logic to eventPaymentService.
 */

const Assignment = require('../models/Assignment');

// ─────────────────────────────────────────────────────────────
// @desc   Payments Management Page (EJS)
// @route  GET /portal/admin-staff/payments-page
// ─────────────────────────────────────────────────────────────
exports.getPaymentsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getPaymentsPageData(req.query);
        res.render('admin/payments', { user: req.user, ...data });
    } catch (error) {
        console.error('[adminFinanceController] getPaymentsPage:', error);
        res.status(500).send('Server Error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Get all payments (JSON, paginated / filtered)
// @route  GET /portal/admin-staff/payments
// ─────────────────────────────────────────────────────────────
exports.getAllPayments = async (req, res) => {
    try {
        const { payment_status, start_date, end_date, staff_id, page = 1 } = req.query;
        const limit = 20;
        const skip = (parseInt(page) - 1) * limit;

        const filter = {};
        if (payment_status) filter.payment_status = payment_status;
        if (start_date || end_date) {
            filter.date = {};
            if (start_date) filter.date.$gte = new Date(start_date);
            if (end_date) filter.date.$lte = new Date(end_date);
        }
        if (staff_id) filter.accepted_staff_ids = staff_id;

        const total = await Assignment.countDocuments(filter);
        const assignments = await Assignment.find(filter)
            .populate('accepted_staff_ids', 'name email')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            data: assignments,
            pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total }
        });
    } catch (error) {
        console.error('[adminFinanceController] getAllPayments:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Update assignment payment status
// @route  PUT /portal/admin-staff/assignments/:id/payment
// ─────────────────────────────────────────────────────────────
exports.updatePaymentStatus = async (req, res) => {
    try {
        const eventPaymentService = require('../financials/services/eventPaymentService');
        const assignment = await eventPaymentService.updatePaymentStatus(
            req.user._id, req.params.id,
            req.body.payment_status, req.body.staff_payment_id, req.body.transaction_id
        );
        res.status(200).json({ success: true, data: assignment });
    } catch (error) {
        console.error('[adminFinanceController] updatePaymentStatus:', error);
        if (error.message === 'Invalid payment status' || error.message === 'Assignment not found')
            return res.status(400).json({ success: false, error: error.message });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Initiate M-Pesa B2C payment to a staff member
// @route  POST /portal/admin-staff/assignments/:id/pay-staff
// ─────────────────────────────────────────────────────────────
exports.initiateStaffPayment = async (req, res) => {
    try {
        const eventPaymentService = require('../financials/services/eventPaymentService');
        const result = await eventPaymentService.initiateStaffPayment(req.user._id, req.params.id, req.body);
        res.json({ success: true, message: result.message });
    } catch (error) {
        console.error('[adminFinanceController] initiateStaffPayment:', error?.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error?.response?.data?.errorMessage || error.message || 'Payment initiation failed'
        });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   M-Pesa B2C result callback (called by Safaricom)
// @route  POST /portal/admin-staff/mpesa/callback  [PUBLIC — no auth]
// ─────────────────────────────────────────────────────────────
exports.mpesaCallback = async (req, res) => {
    try {
        const eventPaymentService = require('../financials/services/eventPaymentService');
        await eventPaymentService.mpesaCallback(req.body);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[adminFinanceController] mpesaCallback:', error.message);
        res.status(200).json({ success: true }); // Always 200 to Safaricom
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   M-Pesa B2C timeout
// @route  POST /portal/admin-staff/mpesa/timeout  [PUBLIC — no auth]
// ─────────────────────────────────────────────────────────────
exports.mpesaTimeout = async (req, res) => {
    console.warn('[adminFinanceController] M-Pesa B2C timeout:', req.body);
    res.status(200).json({ success: true });
};

// ─────────────────────────────────────────────────────────────
// @desc   Manually mark a staff payment as Received
// @route  POST /portal/admin-staff/assignments/:id/payments/:spid/mark-received
// ─────────────────────────────────────────────────────────────
exports.markPaymentReceived = async (req, res) => {
    try {
        const eventPaymentService = require('../financials/services/eventPaymentService');
        await eventPaymentService.markPaymentReceived(req.user._id, req.params.id, req.params.spid);
        res.json({ success: true });
    } catch (error) {
        console.error('[adminFinanceController] markPaymentReceived:', error);
        if (error.message === 'Payment record not found')
            return res.status(404).json({ success: false, error: error.message });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Seed staff_payments array from accepted_staff_ids
// @route  POST /portal/admin-staff/payments/seed-staff-payments
// ─────────────────────────────────────────────────────────────
exports.seedStaffPayments = async (req, res) => {
    try {
        const assignments = await Assignment.find({
            'staff_payments.0': { $exists: false },
            'accepted_staff_ids.0': { $exists: true }
        }).populate('accepted_staff_ids', 'name phone');

        let seeded = 0;
        for (const a of assignments) {
            a.staff_payments = a.accepted_staff_ids.map(s => ({
                staff_id: s._id,
                staff_name: s.name,
                phone: s.phone || '',
                amount: a.pay_rate,
                status: a.payment_status || 'Pending'
            }));
            await a.save();
            seeded++;
        }
        res.json({ success: true, seeded });
    } catch (e) {
        console.error('[adminFinanceController] seedStaffPayments:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
