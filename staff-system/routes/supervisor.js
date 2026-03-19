const express = require('express');
const {
    getDashboard, removeMember, getSuggestedReplacements,
    updateReadiness, rateStaff, broadcastMessage, getTeamCommunications,
    getEvents, getTeamManagement, getCommunications, getRatings,
    getProfile, updateLocation
} = require('../controllers/supervisorController');
const { protect, authorize }  = require('../middleware/auth');
const staffController          = require('../controllers/staffController');
const liveCtrl                 = require('../controllers/liveController');
const { validatePasswordChange, sanitizeRequestBody } = require('../middleware/validation');

const router = express.Router();

router.use(protect);
router.use(authorize('Supervisor', 'Admin'));

// ──────────────────────────────────────────
// SIDEBAR PAGE ROUTES
// ──────────────────────────────────────────
router.get('/dashboard', getDashboard);
router.get('/events', getEvents);
router.get('/team-management', getTeamManagement);
router.get('/communications', getCommunications);
router.get('/ratings', getRatings);
router.get('/profile', getProfile);
router.get('/settings', staffController.getSettings);

// Profile management
router.put('/profile', sanitizeRequestBody, staffController.updateProfile);
router.post('/change-password', validatePasswordChange, staffController.changeOwnPassword);

// GPS location update (critical for proximity check)
router.post('/location', sanitizeRequestBody, updateLocation);

// ──────────────────────────────────────────
// API ROUTES (JSON responses)
// ──────────────────────────────────────────

// Team management
router.post('/teams/:teamId/remove-member', sanitizeRequestBody, removeMember);
router.get('/teams/:teamId/suggest-replacements', getSuggestedReplacements);
router.post('/teams/:teamId/readiness', sanitizeRequestBody, updateReadiness);

// Team communication
router.post('/teams/:teamId/communication', sanitizeRequestBody, broadcastMessage);
router.get('/teams/:teamId/communications', getTeamCommunications);

// Performance
router.post('/rate-staff', sanitizeRequestBody, rateStaff);

// ── Phase 12: Live Command Center (Supervisor side) ───────────────────────────
// Supervisor sends message to admin live command center
router.post('/live/message',
    liveCtrl.liveChatUpload.single('attachment'),
    liveCtrl.sendSupervisorMessage
);
// Supervisor raises emergency flag (goes directly to admin command center)
router.post('/emergency', sanitizeRequestBody, liveCtrl.flagEmergency);

// ──────────────────────────────────────────────────────────────────────────────
// CLOCK-IN / CLOCK-OUT  (supervisorService)
// ──────────────────────────────────────────────────────────────────────────────
const supervisorService        = require('../services/supervisorService');
const eventLifecycleService    = require('../services/eventLifecycleService');
const multer                   = require('multer');
const path                     = require('path');

// Selfie upload — stored in public/uploads/selfies/
const selfieStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/selfies')),
    filename:    (req, file, cb) => cb(null, `selfie-${Date.now()}-${req.user._id}${path.extname(file.originalname)}`)
});
const selfieUpload = multer({
    storage: selfieStorage,
    limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files allowed'));
        cb(null, true);
    }
});

/**
 * POST /portal/supervisor/assignments/:id/clock-in
 * Body: { lat, lng, platform, device_id, session_token }
 * Multipart: selfie (image file, optional but recommended)
 */
router.post('/assignments/:id/clock-in',
    selfieUpload.single('selfie'),
    async (req, res) => {
        try {
            const { lat, lng, platform, device_id, session_token } = req.body;
            const selfie_url = req.file ? `/uploads/selfies/${req.file.filename}` : null;

            const { attendance, proximityResult, fraudFlags } = await supervisorService.clockIn(
                req.user._id,
                req.params.id,
                parseFloat(lat), parseFloat(lng),
                {
                    selfie_url,
                    user_agent:    req.headers['user-agent'],
                    ip_address:    req.ip || req.headers['x-forwarded-for'],
                    platform,
                    device_id,
                    session_token
                }
            );

            res.json({
                success: true,
                attendance,
                proximityResult,
                fraudFlags: fraudFlags.length > 0 ? fraudFlags : undefined
            });
        } catch (err) {
            console.error('[supervisor] clock-in error:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    }
);

/**
 * POST /portal/supervisor/assignments/:id/clock-out
 * Body: { lat?, lng? }
 */
router.post('/assignments/:id/clock-out',
    sanitizeRequestBody,
    async (req, res) => {
        try {
            const { lat, lng } = req.body;
            const { attendance, payroll } = await supervisorService.clockOut(
                req.user._id,
                req.params.id,
                lat ? parseFloat(lat) : null,
                lng ? parseFloat(lng) : null
            );
            res.json({ success: true, attendance, payroll: payroll || null });
        } catch (err) {
            console.error('[supervisor] clock-out error:', err.message);
            res.status(err.message.includes('No active clock-in') ? 404 : 500).json({ success: false, error: err.message });
        }
    }
);

/**
 * POST /portal/supervisor/attendance/:attendanceId/verify-selfie
 */
router.post('/attendance/:attendanceId/verify-selfie', async (req, res) => {
    try {
        const attendance = await supervisorService.verifySelfie(req.params.attendanceId, req.user._id);
        res.json({ success: true, attendance });
    } catch (err) {
        res.status(err.message === 'Attendance record not found' ? 404 : 500).json({ success: false, error: err.message });
    }
});

/**
 * POST /portal/supervisor/attendance/:attendanceId/override-proximity
 * Body: { reason }
 */
router.post('/attendance/:attendanceId/override-proximity', sanitizeRequestBody, async (req, res) => {
    try {
        const attendance = await supervisorService.overrideProximityDenial(req.user._id, req.params.attendanceId, req.body.reason);
        res.json({ success: true, attendance });
    } catch (err) {
        const code = err.message === 'Attendance record not found' ? 404 : 500;
        res.status(code).json({
            success: false,
            error: code === 500 ? {
                code: "INTERNAL_ERROR",
                message: "An error occurred processing your request",
                statusCode: 500,
                details: err.message
            } : err.message,
            timestamp: new Date()
        });
    }
});

/**
 * GET  /portal/supervisor/assignments/:id/attendance
 */
router.get('/assignments/:id/attendance', async (req, res) => {
    try {
        const records = await supervisorService.getEventAttendance(req.params.id);
        res.json({ success: true, data: records });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// GEO ANCHOR
// ──────────────────────────────────────────────────────────────────────────────

/** POST /portal/supervisor/assignments/:id/geo-anchor  — drop anchor */
router.post('/assignments/:id/geo-anchor', sanitizeRequestBody, async (req, res) => {
    try {
        const { lat, lng, radiusMetres } = req.body;
        const team = await supervisorService.dropGeoAnchor(
            req.user._id, req.params.id,
            parseFloat(lat), parseFloat(lng),
            radiusMetres ? parseInt(radiusMetres) : undefined
        );
        res.json({ success: true, geoAnchor: team.geoAnchor });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** DELETE /portal/supervisor/assignments/:id/geo-anchor  — clear anchor */
router.delete('/assignments/:id/geo-anchor', async (req, res) => {
    try {
        await supervisorService.clearGeoAnchor(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** GET /portal/supervisor/assignments/:id/geo-anchor  — get current anchor */
router.get('/assignments/:id/geo-anchor', async (req, res) => {
    try {
        const anchor = await supervisorService.getGeoAnchor(req.params.id);
        res.json({ success: true, geoAnchor: anchor });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// EVENT LIFECYCLE  (Admin only — supervisor views current state only)
// ──────────────────────────────────────────────────────────────────────────────

/** GET /portal/supervisor/assignments/:id/lifecycle */
router.get('/assignments/:id/lifecycle', async (req, res) => {
    try {
        const currentState = await eventLifecycleService.getCurrentState(req.params.id);
        const validNext    = eventLifecycleService.getValidTransitions(currentState);
        res.json({ success: true, currentState, validNextStates: validNext });
    } catch (err) {
        res.status(err.message === 'Assignment not found' ? 404 : 500).json({ success: false, error: err.message });
    }
});

/** POST /portal/supervisor/assignments/:id/lifecycle  — (Admin only) manually transition */
router.post('/assignments/:id/lifecycle',
    authorize('Admin'),
    sanitizeRequestBody,
    async (req, res) => {
        try {
            const { targetState, reason, force } = req.body;
            const result = await eventLifecycleService.transition(
                req.params.id, targetState, req.user._id,
                { reason, force: force === true && req.user.role === 'Admin' }
            );
            res.json({ success: true, ...result });
        } catch (err) {
            const code = err.message.includes('Invalid lifecycle') || err.message.includes('Transition blocked') ? 400 : 500;
            res.status(code).json({
                success: false,
                error: code === 500 ? {
                    code: "INTERNAL_ERROR",
                    message: "An error occurred processing your request",
                    statusCode: 500,
                    details: err.message
                } : err.message,
                timestamp: new Date()
            });
        }
    }
);

module.exports = router;
