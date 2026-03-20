/**
 * adminFinanceRoutes.js
 * Routes: Payments, M-Pesa B2C, Mark-Received
 * Mount prefix: /portal/admin-staff  (all URLs stay identical to the old admin.js)
 *
 * NOTE: M-Pesa callbacks are placed BEFORE the protect middleware because
 *       Safaricom calls them without auth headers.
 */

const express = require('express');
const { validateParam } = require('../utils/validateObjectId');
const router = express.Router();

const ctrl = require('../controllers/adminFinanceController');
const { protect, authorize } = require('../middleware/auth');
const { sanitizeRequestBody } = require('../middleware/validation');

// ── PUBLIC callbacks (Safaricom, no auth) ─────────────────────
router.post('/mpesa/callback', ctrl.mpesaCallback);
router.post('/mpesa/timeout',  ctrl.mpesaTimeout);

// ── Apply auth to all routes below ───────────────────────────
router.use(protect, authorize('Admin', 'Super Admin'));

// ── EJS page views ────────────────────────────────────────────
router.get('/payments-page',   ctrl.getPaymentsPage);

// ── JSON API ──────────────────────────────────────────────────
router.get('/payments',        ctrl.getAllPayments);
// router.get('/export/payments', ctrl.exportPayments); // TODO: implement

// ── Per-assignment payment operations ────────────────────────
router.put('/assignments/:id/payment', validateParam('id'),                         sanitizeRequestBody, ctrl.updatePaymentStatus);
router.post('/assignments/:id/pay-staff', validateParam('id'),                      protect, authorize('Admin'), ctrl.initiateStaffPayment);
router.post('/assignments/:id/payments/:spid/mark-received', validateParam('id'),   ctrl.markPaymentReceived);

// ── Payment receipt PDF ───────────────────────────────────────
router.get('/payments/:assignmentId/receipt/:staffId', protect, authorize('Admin'), ctrl.generatePaymentReceipt);

// ── Utility: seed staff_payments from accepted_staff_ids ─────
router.post('/payments/seed-staff-payments',                   protect, authorize('Admin'), ctrl.seedStaffPayments);

// ── Added From Test Assertions ────────────────────────────────
const financeController = require('../financials/controllers/financeController');
router.post('/expenses/log', financeController.logExpense);
router.get('/payroll',       financeController.getPayrollList);

module.exports = router;
