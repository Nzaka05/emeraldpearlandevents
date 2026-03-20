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

// ── AI Command Center & Analytics ──
const aiAnalyticsController = require('../staff-controllers/aiAnalyticsController');
const { aiReadLimiter } = require('../staff-middleware/aiRateLimiter');
const { validateParam, isValidObjectId } = require('../staff-system/utils/validateObjectId');
const AuditLog = require('../staff-system/models/AuditLog');

const ALLOWED_ALERT_STATUSES = ['unread', 'read', 'resolved'];

router.get('/ai/command-center', aiReadLimiter, aiAnalyticsController.renderCommandCenter);
router.get('/ai/analytics', aiReadLimiter, aiAnalyticsController.getAnalyticsData);
router.get('/ai/analytics-dashboard', aiReadLimiter, aiAnalyticsController.renderAnalytics);

// ── Staff Intelligence ──
const staffIntelligenceController = require('../staff-controllers/staffIntelligenceController');
router.get('/ai/staff-intelligence', aiReadLimiter, staffIntelligenceController.renderStaffIntelligence);
router.get('/ai/staff-ranking', aiReadLimiter, staffIntelligenceController.getStaffRankingAPI);

// ── AI Alerts API ──
const aiAlertService = require('../staff-system/services/aiAlertService');
router.get('/ai/alerts', aiReadLimiter, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const status = req.query.status || undefined;
        const severity = req.query.severity || undefined;

        // Validate status if provided
        if (status && !ALLOWED_ALERT_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status filter' });
        }

        const alerts = await aiAlertService.getAlerts({ status, severity, limit });
        res.json({ success: true, data: alerts });
    } catch (e) {
        console.error('[Admin AI] getAlerts error:', e);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.put('/ai/alerts/:id/status', aiReadLimiter, validateParam('id'), async (req, res) => {
    try {
        const newStatus = req.body.status;
        if (!newStatus || !ALLOWED_ALERT_STATUSES.includes(newStatus)) {
            return res.status(400).json({ success: false, error: `Invalid status. Allowed: ${ALLOWED_ALERT_STATUSES.join(', ')}` });
        }

        const alert = await aiAlertService.updateAlertStatus(req.params.id, newStatus);
        if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });

        // Audit log
        AuditLog.create({
            actionType: 'AI_ALERT_STATUS_CHANGED',
            targetModel: 'AIAlert',
            targetId: req.params.id,
            performedBy: req.user._id,
            details: { new_status: newStatus },
            ipAddress: req.ip
        }).catch(err => console.error('[AuditLog] Alert status log failed:', err.message));

        res.json({ success: true, data: alert });
    } catch (e) {
        console.error('[Admin AI] updateAlertStatus error:', e);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ── AI Auto-Suggestions ──
const aiActionService = require('../staff-system/services/aiActionService');
router.get('/ai/suggestions/:eventId', aiReadLimiter, validateParam('eventId'), async (req, res) => {
    try {
        const suggestions = await aiActionService.generateAutoSuggestions(req.params.eventId);
        res.json({ success: true, data: suggestions });
    } catch (e) {
        console.error('[Admin AI] getSuggestions error:', e);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;

