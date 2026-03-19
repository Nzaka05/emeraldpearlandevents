const express = require('express');
const {
    getDashboard, removeMember, getSuggestedReplacements,
    updateReadiness, rateStaff, broadcastMessage, getTeamCommunications
} = require('../staff-controllers/supervisorController');
const { protect, authorize } = require('../staff-middleware/auth');
const staffController = require('../staff-controllers/staffController');
const { validatePasswordChange, sanitizeRequestBody } = require('../staff-middleware/validation');

const router = express.Router();

router.use(protect);
router.use(authorize('Supervisor', 'Admin'));

router.get('/dashboard', getDashboard);

// Profile management (using staff controller functions)
router.put('/profile', sanitizeRequestBody, staffController.updateProfile);
router.post('/change-password', validatePasswordChange, staffController.changeOwnPassword);

// Team management
router.post('/teams/:teamId/remove-member', sanitizeRequestBody, removeMember);
router.get('/teams/:teamId/suggest-replacements', getSuggestedReplacements);
router.post('/teams/:teamId/readiness', sanitizeRequestBody, updateReadiness);

// Team communication
router.post('/teams/:teamId/communication', sanitizeRequestBody, broadcastMessage);
router.get('/teams/:teamId/communications', getTeamCommunications);

// Performance
router.post('/rate-staff', sanitizeRequestBody, rateStaff);

module.exports = router;
