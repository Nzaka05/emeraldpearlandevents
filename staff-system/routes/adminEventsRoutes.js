/**
 * adminEventsRoutes.js
 * Routes: Assignments, Teams, Attendance, Replacements
 * Mount prefix: /portal/admin-staff  (all URLs stay identical to the old admin.js)
 */

const express = require('express');
const { validateParam } = require('../utils/validateObjectId');
const router = express.Router();

const ctrl = require('../controllers/adminEventsController');
const plannerCtrl = require('../controllers/plannerController');
const surveyCtrl = require('../controllers/surveyController');
const { protect, authorize } = require('../middleware/auth');
const { validateAssignmentCreation, sanitizeRequestBody } = require('../middleware/validation');

// ── Apply auth to every route in this file ────────────────────
router.use(protect, authorize('Admin', 'Super Admin'));

// ── EJS page views ────────────────────────────────────────────
router.get('/events',             ctrl.getEventsPage);
router.get('/attendance',         ctrl.getAttendancePage);
router.get('/planners',           plannerCtrl.getPlannersPage);
router.get('/surveys',            surveyCtrl.getSurveyAnalyticsPage);

// ── Phase 7: Event Planners Directory ────────────────────────
router.post('/planners',                      sanitizeRequestBody, plannerCtrl.createPlanner);
router.put('/planners/:id', validateParam('id'), sanitizeRequestBody, plannerCtrl.updatePlanner);
router.delete('/planners/:id', validateParam('id'),                  plannerCtrl.deletePlanner);
router.post('/planners/:id/link/:assignmentId', validateParam('id'), validateParam('assignmentId'), plannerCtrl.linkPlannerToAssignment);

// ── Team management ───────────────────────────────────────────
router.get('/event-teams',                        ctrl.getAllTeams);
router.post('/event-teams',                       ctrl.createTeam);
router.get('/event-teams/create-data',            ctrl.getTeamCreateData);
router.post('/event-teams/:teamId/disband',       ctrl.disbandTeam);
router.get('/event-teams/:teamId/disband-check',  ctrl.checkDisbandEligibility);

// ── Assignment management ─────────────────────────────────────
router.post('/assignments',                       sanitizeRequestBody, validateAssignmentCreation, ctrl.createAssignment);
router.get('/assignments/:id', validateParam('id'),                    protect, authorize('Admin'), ctrl.getSingleAssignment);
router.put('/assignments/:id', validateParam('id'),                    sanitizeRequestBody, ctrl.updateAssignment);
router.delete('/assignments/:id', validateParam('id'),                 ctrl.deleteAssignment);

// Test delete helper (smoke-test route)
router.all('/assignments/test-delete',            (req, res) => res.json({ method: req.method, working: true }));

// ── Assignment sub-routes ─────────────────────────────────────
router.put('/assignments/:id/supervisor', validateParam('id'),         protect, authorize('Admin'), ctrl.assignEventSupervisor);
router.put('/assignments/:id/assign-staff', validateParam('id'),       protect, authorize('Admin'), ctrl.assignStaffToEvent);
router.put('/assignments/:id/toggle-applications', validateParam('id'),protect, authorize('Admin'), ctrl.toggleApplications);
router.get('/assignments/:id/report', validateParam('id'),             ctrl.getEventReport);

// ── Applicants ────────────────────────────────────────────────
router.post('/assignments/:id/applicants/:staffId', validateParam('id'), validateParam('staffId'), validateParam('id'), protect, authorize('Admin'), ctrl.handleApplicant);

// ── Replacement requests ──────────────────────────────────────
router.post('/replacements/:id/approve', validateParam('id'),          ctrl.approveReplacement);
router.post('/replacements/:id/reject', validateParam('id'),           ctrl.rejectReplacement);

// ── AI Event Prediction ───────────────────────────────────────
router.get('/events/:id/prediction', validateParam('id'),              ctrl.getEventPrediction);

// ── Emergency Funds Security Layer ────────────────────────────
router.post('/auth/biometric-verify',             ctrl.verifyBiometric);
router.post('/emergency-funds/request-otp',       ctrl.requestEmergencyOtp);
router.post('/emergency-funds/send',              ctrl.sendEmergencyFund);
router.post('/emergency-funds/unlock-payout',     ctrl.unlockPayout);

// ── WebAuthn Biometric Registration & Authentication ──────────
router.post('/webauthn/register/options',          ctrl.webauthnRegisterOptions);
router.post('/webauthn/register/verify',           ctrl.webauthnRegisterVerify);
router.post('/webauthn/authenticate/options',      ctrl.webauthnAuthOptions);
router.post('/webauthn/authenticate/verify',       ctrl.webauthnAuthVerify);
router.get('/webauthn/credentials',                ctrl.webauthnGetCredentials);
router.delete('/webauthn/credentials/:credentialId', ctrl.webauthnDeleteCredential);

// ── Dual Approval Endpoints ──────────────────────────────────
router.get('/emergency-funds/pending-approvals',   ctrl.getPendingApprovals);
router.post('/emergency-funds/approve',            ctrl.approveDualApproval);
router.post('/emergency-funds/reject',             ctrl.rejectDualApproval);

// ── Device Management Page ────────────────────────────────────
router.get('/security/devices',                    ctrl.getDeviceManagementPage);

// ── ETR Methods ───────────────────────────────────────────────
router.get('/etr',                                ctrl.getETRs);
router.get('/etr/:eventId', validateParam('eventId'),                       ctrl.getSingleETR);
router.post('/etr/:eventId/generate', validateParam('eventId'),             ctrl.generateETR);
router.post('/etr/:eventId/resend', validateParam('eventId'),               ctrl.resendETR);
router.get('/etr/:eventId/download', validateParam('eventId'),              ctrl.downloadETR);

module.exports = router;


