const respond = require('../../utils/respond');
/**
 * adminReportsController.js
 * Domain: Reports, PDF/CSV Exports
 * Pattern: Thin controller — delegates all generation logic to pdfReportService.
 */

// ─────────────────────────────────────────────────────────────
// @desc   Reports Page (EJS)
// @route  GET /portal/admin-staff/reports
// ─────────────────────────────────────────────────────────────
exports.getReportsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getReportsPageData();
        res.render('admin/reports', { user: req.user, ...data });
    } catch (error) {
        console.error('[adminReportsController] getReportsPage:', error);
        res.status(500).send('Server Error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Export event report as PDF or CSV
// @route  GET /portal/admin-staff/assignments/:id/report/export
// ─────────────────────────────────────────────────────────────
exports.exportReport = async (req, res) => {
    try {
        const pdfReportService = require('../services/pdfReportService');
        await pdfReportService.exportReport(req.params.id, req.query.format || 'csv', res);
    } catch (error) {
        console.error('[adminReportsController] exportReport:', error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Export payment logs as CSV
// @route  GET /portal/admin-staff/export/payments
// ─────────────────────────────────────────────────────────────
exports.exportPayments = async (req, res) => {
    try {
        const pdfReportService = require('../services/pdfReportService');
        await pdfReportService.exportPayments(res);
    } catch (error) {
        console.error('[adminReportsController] exportPayments:', error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Generate payment receipt PDF for one staff member
// @route  GET /portal/admin-staff/payments/:assignmentId/receipt/:staffId
// ─────────────────────────────────────────────────────────────
exports.generatePaymentReceipt = async (req, res) => {
    try {
        const pdfReportService = require('../services/pdfReportService');
        await pdfReportService.generatePaymentReceipt(req.params.assignmentId, req.params.staffId, res);
    } catch (err) {
        console.error('[adminReportsController] generatePaymentReceipt:', err);
        respond(res, 500, { success: false, error: 'Failed to generate receipt' });
    }
};
