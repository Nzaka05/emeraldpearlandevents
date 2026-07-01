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
const invoiceCtrl = require('../controllers/invoiceController');
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrfProtection');
const { sanitizeRequestBody } = require('../middleware/validation');
// Centralized webhook security — verifySafaricomIP is mounted in server.js
// directly on the callback route, before these routes load.
// Kept here as reference import only.
// const { verifySafaricomIP } = require('../middleware/webhookSecurity');

// ── Apply auth to all routes below ───────────────────────────
router.use(protect, authorize('Admin', 'Super Admin'));

// ── EJS page views ────────────────────────────────────────────
router.get('/payments-page',   ctrl.getPaymentsPage);
router.get('/invoices',        invoiceCtrl.getInvoicesPage);

// ── JSON API ──────────────────────────────────────────────────
router.get('/payments',        ctrl.getAllPayments);
router.get('/export/payments', adminController.exportPayments);

// ── Phase 6: Client Invoices ──────────────────────────────────
router.post('/invoices/generate',        csrfProtection, sanitizeRequestBody, invoiceCtrl.generateInvoice);
router.get('/invoices/:id/download',     validateParam('id'), invoiceCtrl.downloadInvoice);
router.put('/invoices/:id/status',       validateParam('id'), sanitizeRequestBody, invoiceCtrl.updateInvoiceStatus);
router.put('/invoices/:id',              validateParam('id'), sanitizeRequestBody, invoiceCtrl.updateInvoice);
router.post('/invoices/:id/send-email',  validateParam('id'), invoiceCtrl.sendInvoiceEmail);
router.delete('/invoices/:id',           csrfProtection, validateParam('id'), invoiceCtrl.deleteInvoice);

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
