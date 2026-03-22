const express = require('express');
const {
    getDashboard, updateAvailability, respondToAssignment,
    clockInOut, getAttendanceHistory, getNotifications,
    getPaymentHistory,
    downloadPaymentReceipt,
    subscribePush, updateProfile, changeOwnPassword,
    getAssignmentsPage, getTeamPage, getAttendancePage,
    sendTeamMessage,
    getPaymentsPage, getProfilePage, updateLocation,
    uploadProfilePhoto
} = require('../controllers/staffController');
const { protect, authorize } = require('../middleware/auth');
const { validatePasswordChange, sanitizeRequestBody } = require('../middleware/validation');
const { proximityCheck } = require('../middleware/proximity');
const { uploadStaffPhoto } = require('../middleware/upload');

const router = express.Router();

router.use(protect);
router.use(authorize('Staff', 'Supervisor', 'Admin'));

// ──────────────────────────────────────────
// SIDEBAR / BOTTOM NAV PAGE ROUTES
// ──────────────────────────────────────────
router.get('/dashboard', getDashboard);
router.get('/assignments', getAssignmentsPage);
router.get('/team', getTeamPage);
router.get('/notifications', require('../controllers/staffController').getNotificationsPage);
router.get('/notifications/count', async (req, res) => {
    try {
        const Assignment = require('../models/Assignment');
        const EventTeam = require('../models/EventTeam');
        const EventTeamCommunication = require('../models/EventTeamCommunication');
        let count = 0;
        const teams = await EventTeam.find({ member_ids: req.user._id }).select('_id');
        if (teams.length > 0) {
            const comms = await EventTeamCommunication.countDocuments({
                team_id: { $in: teams.map(t => t._id) },
                message_type: { $ne: 'Chat' },
                timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            });
            count += comms;
        }
        const payments = await Assignment.countDocuments({
            accepted_staff_ids: req.user._id,
            'staff_payments': { $elemMatch: { staff_id: req.user._id, status: 'Sent' } }
        });
        count += payments;
        res.json({ success: true, count });
    } catch(e) {
        res.json({ success: true, count: 0 });
    }
});
router.post('/team/message', sendTeamMessage);
router.post('/team/message/upload', (() => {
    const multer = require('multer');
    const path = require('path');
    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'public/uploads/chat'),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname))
    });
    const upload = multer({
        storage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|webm/;
            cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
        }
    });
    return upload.single('file');
})(), require('../controllers/staffController').sendTeamMediaMessage);
router.get('/attendance', getAttendancePage);
router.get('/payments', getPaymentsPage);
router.get('/profile', getProfilePage);
router.get('/settings', require('../controllers/staffController').getSettings);

// Profile management
router.put('/profile', sanitizeRequestBody, updateProfile);
router.post('/profile/photo', uploadStaffPhoto, uploadProfilePhoto);
router.post('/change-password', validatePasswordChange, changeOwnPassword);

// GPS location update
router.post('/location', sanitizeRequestBody, updateLocation);

// ──────────────────────────────────────────
// API ROUTES
// ──────────────────────────────────────────
router.put('/availability', sanitizeRequestBody, updateAvailability);
router.post('/assignments/:id/response', sanitizeRequestBody, respondToAssignment);

// Clock-in with proximity check middleware chain:
// auth → authorize → proximityCheck → clockInOut
router.post('/attendance', sanitizeRequestBody, proximityCheck, clockInOut);

router.get('/attendance-history', getAttendanceHistory);
router.get('/notifications', getNotifications);
router.post('/assignments/:id/payment/confirm', require('../controllers/staffController').confirmPaymentReceipt);
router.post('/assignments/:id/payment/dispute', sanitizeRequestBody, require('../controllers/staffController').disputePayment);
router.get('/payment-history', getPaymentHistory);
router.get('/payments/:assignmentId/receipt', downloadPaymentReceipt);
router.post('/push-subscribe', subscribePush);

// ── Phase 11: Post-event surveys (token-accessible without auth) ──────────────
const surveyCtrl = require('../controllers/surveyController');
router.get('/survey/:token', surveyCtrl.getSurveyPage);
router.post('/survey/:token/submit', sanitizeRequestBody, surveyCtrl.submitSurvey);

router.get('/ai', (req, res) => res.render('staff/pearl', { currentPage: 'pearl', user: req.user }));
router.post('/ai/chat', async (req, res) => { try { const aiAssistantService = require('../services/aiAssistantService'); const { query, eventContext, history } = req.body; if (!query) return res.status(400).json({ success: false, message: 'Query required' }); const userId = req.user?._id || '000000000000000000000000'; const role = req.user?.role || 'Staff'; const fullContext = { ...eventContext, userName: req.user?.name, role }; const result = await aiAssistantService.processAssistantQuery(userId, role, query, fullContext, history || []); res.json({ success: true, data: result }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
module.exports = router;

