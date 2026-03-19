const express = require('express');
const {
    getDashboard, getAllStaff, addStaff, editStaff, deleteStaff,
    toggleSuspend, adminResetPassword, getAuditLogs, getStaffPerformance,
    createAssignment, updateAssignment, updatePaymentStatus,
    getAllPayments, exportReport, exportPayments,
    approveReplacement, rejectReplacement, getEventReport
} = require('../staff-controllers/adminController');
const { protect, authorize } = require('../staff-middleware/auth');
const { uploadStaffPhoto } = require('../staff-middleware/upload');
const staffController = require('../staff-controllers/staffController');
const adminEtrController = require('../server/controllers/adminEtrController');
const { 
    validateStaffCreation, 
    validateStaffUpdate, 
    validateAssignmentCreation,
    validatePasswordChange,
    sanitizeRequestBody
} = require('../staff-middleware/validation');
const eventPaymentService = require('../staff-system/financials/services/eventPaymentService');

const router = express.Router();

// ── PUBLIC M-Pesa callbacks (no auth — Safaricom calls these) ──
router.post('/mpesa/callback', async (req, res) => {
    try {
        await eventPaymentService.mpesaCallback(req.body);
        res.json({ ResultCode: 0, ResultDesc: 'Success' });
    } catch (err) {
        console.error('[mpesa/callback] error:', err.message);
        res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' }); // always 200 to Safaricom
    }
});

router.post('/mpesa/timeout', (req, res) => {
    console.warn('[mpesa/timeout] Safaricom timeout:', req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
});

// All routes below require Admin role
router.use(protect);
router.use(authorize('Admin'));

// Dashboard
router.get('/dashboard', getDashboard);

// Profile management (using staff controller functions)
router.put('/profile', sanitizeRequestBody, staffController.updateProfile);
router.post('/change-password', validatePasswordChange, staffController.changeOwnPassword);

// Staff management
router.get('/staff', getAllStaff);
router.post('/staff', sanitizeRequestBody, validateStaffCreation, uploadStaffPhoto, addStaff);
router.put('/staff/:id', sanitizeRequestBody, validateStaffUpdate, uploadStaffPhoto, editStaff);
router.delete('/staff/:id', deleteStaff);
router.put('/staff/:id/suspend', toggleSuspend);
router.post('/staff/:id/reset-password', adminResetPassword);
router.get('/staff/:id/performance', getStaffPerformance);

// Assignments
router.post('/assignments', sanitizeRequestBody, validateAssignmentCreation, createAssignment);
router.put('/assignments/:id', sanitizeRequestBody, updateAssignment);
router.put('/assignments/:id/payment', sanitizeRequestBody, updatePaymentStatus);
router.get('/assignments/:id/report', getEventReport);
router.get('/assignments/:id/report/export', exportReport);

// ETR Reports
router.get('/etr', adminEtrController.listETRs);
router.get('/etr/:eventId', adminEtrController.viewETR);
router.post('/etr/:eventId/generate', adminEtrController.generateETRManually);
router.post('/etr/:eventId/resend', adminEtrController.resendETR);
router.get('/etr/:eventId/download', adminEtrController.downloadETR);

// Payments
router.get('/payments', getAllPayments);
router.get('/export/payments', exportPayments);

// Replacement requests
router.post('/replacements/:id/approve', approveReplacement);
router.post('/replacements/:id/reject', rejectReplacement);

// Audit logs
router.get('/audit-logs', getAuditLogs);

module.exports = router;
