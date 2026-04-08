/**
const respond = require('../../utils/respond');
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

        respond(res, 200, {
            success: true,
            data: assignments,
            pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total }
        });
    } catch (error) {
        console.error('[adminFinanceController] getAllPayments:', error);
        respond(res, 500, { success: false, error: 'Server Error' });
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
        respond(res, 200, { success: true, data: assignment });
    } catch (error) {
        console.error('[adminFinanceController] updatePaymentStatus:', error);
        if (error.message === 'Invalid payment status' || error.message === 'Assignment not found')
            return respond(res, 400, { success: false, error: error.message });
        respond(res, 500, { success: false, error: 'Server Error' });
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
        respond(res, 200, { success: true, message: result.message });
    } catch (error) {
        console.error('[adminFinanceController] initiateStaffPayment:', error?.response?.data || error.message);
        respond(res, 500, {
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
        const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();
        const payload = {
            ...req.body,
            idempotencyKey: req.headers['x-idempotency-key'] || req.body?.idempotencyKey
        };
        const result = payload?.Result;

        if (!result || typeof result !== 'object' || !result.Occasion) {
            console.warn('[adminFinanceController] mpesaCallback invalid payload ignored');
            return respond(res, 200, { success: true, ignored: true });
        }

        if (queueMode === 'async') {
            const { paymentQueue } = require('../../config/queues');
            await paymentQueue.add('mpesa.callback', { payload });
        } else {
            const eventPaymentService = require('../financials/services/eventPaymentService');
            await eventPaymentService.mpesaCallback(payload);
        }
        respond(res, 200, { success: true });
    } catch (error) {
        console.error('[adminFinanceController] mpesaCallback:', error.message);
        respond(res, 200, { success: true }); // Always 200 to Safaricom
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   M-Pesa B2C timeout
// @route  POST /portal/admin-staff/mpesa/timeout  [PUBLIC — no auth]
// ─────────────────────────────────────────────────────────────
exports.mpesaTimeout = async (req, res) => {
    console.warn('[adminFinanceController] M-Pesa B2C timeout:', req.body);
    respond(res, 200, { success: true });
};

// ─────────────────────────────────────────────────────────────
// @desc   Manually mark a staff payment as Received
// @route  POST /portal/admin-staff/assignments/:id/payments/:spid/mark-received
// ─────────────────────────────────────────────────────────────
exports.markPaymentReceived = async (req, res) => {
    try {
        const eventPaymentService = require('../financials/services/eventPaymentService');
        await eventPaymentService.markPaymentReceived(req.user._id, req.params.id, req.params.spid);
        respond(res, 200, { success: true });
    } catch (error) {
        console.error('[adminFinanceController] markPaymentReceived:', error);
        if (error.message === 'Payment record not found')
            return respond(res, 404, { success: false, error: error.message });
        respond(res, 500, { success: false, error: 'Server Error' });
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
        respond(res, 200, { success: true, seeded });
    } catch (e) {
        console.error('[adminFinanceController] seedStaffPayments:', e);
        respond(res, 500, { success: false, error: e.message });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Download staff payment receipt PDF (Admin)
// @route  GET /portal/admin-staff/payments/:assignmentId/receipt/:staffId
// ─────────────────────────────────────────────────────────────
exports.generatePaymentReceipt = async (req, res) => {
    try {
        const Assignment = require('../models/Assignment');
        const assignment = await Assignment.findById(req.params.assignmentId).populate('accepted_staff_ids', 'name phone specific_role role');
        if (!assignment) return respond(res, 404, { success: false, error: 'Assignment not found' });

        const payment = assignment.staff_payments.find(
            p => p.staff_id.toString() === req.params.staffId
        );
        if (!payment) return respond(res, 404, { success: false, error: 'Payment record not found' });

        const staffMember = assignment.accepted_staff_ids.find(s => s._id.toString() === req.params.staffId);
        const staffName = staffMember ? staffMember.name : payment.staff_name;
        const staffPhone = staffMember ? staffMember.phone : payment.phone;
        const staffRole = staffMember ? (staffMember.specific_role || staffMember.role) : 'Staff';

        const PDFDocument = require('pdfkit');
        const path = require('path');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${assignment.title.replace(/\s+/g, '-')}-${staffName.replace(/\s+/g, '-')}.pdf"`);
        doc.pipe(res);

        const emeraldGreen = '#1a6b3c';
        const darkGray = '#2c2c2c';
        const lightGray = '#f5f5f5';

        // Header Background
        doc.rect(0, 0, 612, 120).fill(emeraldGreen);
        doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold').text('EMERALD PEARLAND EVENTS', 140, 35);
        doc.fontSize(10).fillColor('rgba(255,255,255,0.8)').font('Helvetica').text('Official Payment Receipt', 140, 58);
        doc.fontSize(10).fillColor('rgba(255,255,255,0.8)').text('emeraldpearlandevents@gmail.com', 140, 73);

        const receiptNo = `EP-${Date.now().toString().slice(-6)}`;
        doc.fontSize(9).fillColor('#bbbbbb').text(`Receipt No: ${receiptNo}`, 400, 55, { align: 'right', width: 162 });

        doc.moveDown(4);

        const col1 = 50;
        const col2 = 320;
        const rowStart = 145;

        // Details
        doc.rect(col1, rowStart, 240, 110).fill(lightGray).stroke('#e0e0e0');
        doc.fontSize(8).fillColor('#888').font('Helvetica-Bold').text('EVENT DETAILS', col1 + 12, rowStart + 10);
        doc.fontSize(10).fillColor(darkGray).font('Helvetica-Bold').text(assignment.title, col1 + 12, rowStart + 24, { width: 216 });
        doc.fontSize(9).fillColor('#555').font('Helvetica').text(`Date: ${new Date(assignment.date).toLocaleDateString()}`, col1 + 12, rowStart + 45);

        doc.rect(col2, rowStart, 242, 110).fill(lightGray).stroke('#e0e0e0');
        doc.fontSize(8).fillColor('#888').font('Helvetica-Bold').text('STAFF DETAILS', col2 + 12, rowStart + 10);
        doc.fontSize(10).fillColor(darkGray).font('Helvetica-Bold').text(staffName || 'N/A', col2 + 12, rowStart + 24);
        doc.fontSize(9).fillColor('#555').font('Helvetica').text(`Role: ${staffRole || 'Staff'}`, col2 + 12, rowStart + 62);

        // Amount
        doc.rect(col1, rowStart + 125, 512, 70).fill(emeraldGreen);
        doc.fontSize(11).fillColor('#d9d9d9').font('Helvetica').text('AMOUNT PAID', col1 + 20, rowStart + 138);
        doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold').text(`KSh ${(payment.amount || 0).toLocaleString()}`, col1 + 20, rowStart + 153);

        const txStart = rowStart + 215;
        doc.fontSize(8).fillColor('#888').font('Helvetica-Bold').text('TRANSACTION DETAILS', col1, txStart);
        doc.moveTo(col1, txStart + 12).lineTo(562, txStart + 12).stroke('#e0e0e0');

        const txDetails = [
            ['Payment Method', 'M-Pesa B2C'],
            ['M-Pesa Reference', payment.mpesa_ref || payment.transaction_id || 'Pending'],
            ['Sent At', payment.sent_at ? new Date(payment.sent_at).toLocaleString() : '-']
        ];
        txDetails.forEach((row, i) => {
            const y = txStart + 20 + (i * 20);
            if (i % 2 === 0) doc.rect(col1, y - 3, 512, 20).fill('#fafafa');
            doc.fontSize(9).fillColor('#666').font('Helvetica').text(row[0], col1 + 8, y);
            doc.fontSize(9).fillColor(darkGray).font('Helvetica-Bold').text(row[1], 320, y);
        });

        doc.end();
    } catch (error) {
        console.error('[adminFinanceController] generatePaymentReceipt error:', error);
        respond(res, 500, { success: false, error: 'Failed to generate receipt' });
    }
};
