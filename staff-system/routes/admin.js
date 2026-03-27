const express = require('express');
const {
    getDashboard, getAllStaff, addStaff, editStaff, deleteStaff,
    toggleSuspend, adminResetPassword, getAuditLogs, getStaffPerformance,
    createAssignment, updateAssignment, updatePaymentStatus, deleteAssignment,
    getAllPayments, exportReport, exportPayments, toggleApplications,
    approveReplacement, rejectReplacement, getEventReport,
    getAllTeams, createTeam, getTeamCreateData,
    getStaffManagementPage, getEventsPage, getAttendancePage,
    getPaymentsPage, getReportsPage, getAuditLogsPage, getSecurityPage,
    assignSupervisor, assignEventSupervisor, assignStaffToEvent,
    updateAdminLocation, initiateStaffPayment, mpesaCallback, mpesaTimeout
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');
const { uploadStaffPhoto } = require('../middleware/upload');
const staffController = require('../controllers/staffController');
const liveCtrl    = require('../controllers/liveController');
const plannerCtrl = require('../controllers/plannerController');
const invoiceCtrl = require('../controllers/invoiceController');
const surveyCtrl  = require('../controllers/surveyController');
const {
    validateStaffCreation,
    validateStaffUpdate,
    validateAssignmentCreation,
    validatePasswordChange,
    sanitizeRequestBody
} = require('../middleware/validation');

const router = express.Router();

// Public M-Pesa callbacks from Safaricom
router.post('/mpesa/callback', mpesaCallback);
router.post('/mpesa/timeout', mpesaTimeout);

// All routes require Admin role
router.use(protect);
router.use(authorize('Admin'));

// ──────────────────────────────────────────
// SIDEBAR PAGE ROUTES (render full EJS views)
// ──────────────────────────────────────────
router.get('/dashboard', getDashboard);
router.get('/staff-management', getStaffManagementPage);
router.get('/events', getEventsPage);
router.get('/attendance', getAttendancePage);
router.get('/payments-page', getPaymentsPage);
router.get('/reports', getReportsPage);
router.get('/audit-logs-page', getAuditLogsPage);
router.get('/security', getSecurityPage);
router.get('/settings', staffController.getSettings);

// ── Phase 12: Live Command Center ──────────────────────
router.get('/live', liveCtrl.getLiveDashboard);
router.post('/live/message', liveCtrl.liveChatUpload.single('attachment'), liveCtrl.sendAdminMessage);
router.post('/live/emergency-ack/:id', liveCtrl.ackEmergency);
router.get('/live/messages', liveCtrl.getRecentMessages);

// ── Phase 7: Event Planners Directory ──────────────────
router.get('/planners', plannerCtrl.getPlannersPage);
router.post('/planners', sanitizeRequestBody, plannerCtrl.createPlanner);
router.put('/planners/:id', sanitizeRequestBody, plannerCtrl.updatePlanner);
router.delete('/planners/:id', plannerCtrl.deletePlanner);
router.post('/planners/:id/link/:assignmentId', plannerCtrl.linkPlannerToAssignment);

// ── Phase 6: Client Invoices ────────────────────────────
router.get('/invoices', invoiceCtrl.getInvoicesPage);
router.post('/invoices/generate', sanitizeRequestBody, invoiceCtrl.generateInvoice);
router.get('/invoices/:id/download', invoiceCtrl.downloadInvoice);
router.put('/invoices/:id/status', sanitizeRequestBody, invoiceCtrl.updateInvoiceStatus);
router.put('/invoices/:id', sanitizeRequestBody, invoiceCtrl.updateInvoice);
router.post('/invoices/:id/send-email', invoiceCtrl.sendInvoiceEmail);
router.delete('/invoices/:id', invoiceCtrl.deleteInvoice);

// ── Phase 11: Survey Analytics ──────────────────────────
router.get('/surveys', surveyCtrl.getSurveyAnalyticsPage);

// -- AI Assistant --

router.get('/ai/analytics', (req, res) => res.render('admin/ai-analytics', { currentPage: 'ai-analytics', user: req.user }));

router.get('/ai/analytics-data', async (req, res) => {
    try {
        const AIConversationLog = require('../ai-learning/models/AIConversationLog');
        const AIFeedback = require('../ai-learning/models/AIFeedback');
        const AIInsight = require('../ai-learning/models/AIInsight');
        const AIAlert = require('../ai-learning/models/AIAlert');
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const [totalConversations, todayConversations, recentConversations, feedbackCount, positiveFeedback, activeAlerts, insights] = await Promise.all([
            AIConversationLog.countDocuments(),
            AIConversationLog.countDocuments({ createdAt: { $gte: todayStart } }),
            AIConversationLog.find().sort({ createdAt: -1 }).limit(10).select('role query createdAt').lean(),
            AIFeedback.countDocuments(),
            AIFeedback.countDocuments({ marked_accurate: true }),
            AIAlert.find({ resolved: false }).limit(5).lean(),
            AIInsight.find().sort({ createdAt: -1 }).limit(5).lean()
        ]);
        res.json({ success: true, analytics: {
            totalConversations, todayConversations,
            recentConversations: recentConversations.map(c => ({ role: c.role, query: c.query?.substring(0,80), time: c.createdAt })),
            feedbackAccuracy: feedbackCount > 0 ? Math.round((positiveFeedback/feedbackCount)*100) : 0,
            activeAlerts: activeAlerts.map(a => ({ type: a.alert_type, message: a.message })),
            insights: insights.map(i => ({ type: i.insight_type, summary: i.summary }))
        }});
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
router.get('/ai/command-center', (req, res) => res.render('admin/ai-command-center', { currentPage: 'ai', user: req.user }));
router.post('/ai/assistant', async (req, res) => { try { const aiAssistantService = require('../services/aiAssistantService'); const { query, eventContext, history } = req.body; if (!query) return res.status(400).json({ success: false, message: 'Query required' }); const userId = req.user?._id || '000000000000000000000000'; const role = req.user?.role || 'Admin'; const fullContext = { ...eventContext, userName: req.user?.name || eventContext?.userName, title: req.user?.title || eventContext?.title, email: req.user?.email || eventContext?.email, role }; const result = await aiAssistantService.processAssistantQuery(userId, role, query, fullContext, history || []); res.json({ success: true, data: result }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });

// ── Phase 10: Leaderboard ──────────────────────────────────────────────────
router.get('/leaderboard', require('../controllers/adminController').getLeaderboardPage);

// ── Phase 4: Category Settings ─────────────────────────────────────────────
router.get('/category-settings', require('../controllers/adminController').getCategorySettingsPage);
router.put('/category-settings', sanitizeRequestBody, require('../controllers/adminController').updateCategorySettings);
router.get('/staff/:id/card', require('../controllers/adminController').getStaffCard);

// Profile management
router.put('/profile', sanitizeRequestBody, staffController.updateProfile);
router.post('/profile/photo', uploadStaffPhoto, staffController.uploadProfilePhoto);
router.post('/change-password', validatePasswordChange, staffController.changeOwnPassword);

// GPS location update (admin/supervisor can update their own)
router.post('/location', sanitizeRequestBody, updateAdminLocation);

// ──────────────────────────────────────────
// API ROUTES (JSON responses)
// ──────────────────────────────────────────

// Staff management
router.get('/staff', getAllStaff);
router.post('/staff', sanitizeRequestBody, validateStaffCreation, uploadStaffPhoto, addStaff);
router.put('/staff/:id', sanitizeRequestBody, validateStaffUpdate, uploadStaffPhoto, editStaff);
router.delete('/staff/:id', deleteStaff);
router.put('/staff/:id/suspend', toggleSuspend);
router.post('/staff/:id/reset-password', adminResetPassword);
router.get('/staff/:id/performance', getStaffPerformance);
router.post('/staff/:id/assign-supervisor', 
  protect, authorize('Admin', 'Super Admin'), 
  assignSupervisor);

// Assignments
router.post('/assignments', sanitizeRequestBody, validateAssignmentCreation, createAssignment);
router.put('/assignments/:id/supervisor', protect, authorize('Admin'), assignEventSupervisor);
router.put('/assignments/:id/assign-staff', protect, authorize('Admin'), assignStaffToEvent);
router.put('/assignments/:id', sanitizeRequestBody, updateAssignment);
router.all('/assignments/test-delete', (req, res) => {
    res.json({ method: req.method, working: true });
});
router.delete('/assignments/:id', deleteAssignment);
router.put('/assignments/:id/payment', sanitizeRequestBody, updatePaymentStatus);
router.get('/assignments/:id/report', getEventReport);
router.get('/assignments/:id/report/export', exportReport);
router.put('/assignments/:id/toggle-applications', protect, authorize('Admin'), toggleApplications);

// Payments
router.get('/payments', getAllPayments);
router.get('/export/payments', exportPayments);
router.post('/assignments/:id/pay-staff', protect, authorize('Admin'), initiateStaffPayment);
router.post('/assignments/:id/payments/:spid/mark-received', require('../controllers/adminController').markPaymentReceived);
router.get('/assignments/:id', protect, authorize('Admin'), require('../controllers/adminController').getSingleAssignment);
router.get('/payments/:assignmentId/receipt/:staffId', protect, authorize('Admin'), require('../controllers/adminController').generatePaymentReceipt);
router.post('/assignments/:id/applicants/:staffId', protect, authorize('Admin'), require('../controllers/adminController').handleApplicant);
router.post('/payments/seed-staff-payments', protect, authorize('Admin'), async (req, res) => {
    try {
        const Assignment = require('../models/Assignment');
        const Staff = require('../models/Staff');
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
        void Staff;
        res.json({ success: true, seeded });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Replacement requests
router.post('/replacements/:id/approve', approveReplacement);
router.post('/replacements/:id/reject', rejectReplacement);

// Audit logs (API)
router.get('/audit-logs', getAuditLogs);

// Teams
router.get('/event-teams', getAllTeams);
router.post('/event-teams', createTeam);
router.get('/event-teams/create-data', getTeamCreateData);
router.post('/event-teams/:teamId/disband', require('../controllers/adminController').disbandTeam);
router.get('/event-teams/:teamId/disband-check', require('../controllers/adminController').checkDisbandEligibility);

module.exports = router;

