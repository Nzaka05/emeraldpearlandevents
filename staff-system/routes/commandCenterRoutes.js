/**
 * commandCenterRoutes.js
 * Routes for the Supervisor Command Center (Port 3001)
 */
const express = require('express');
const router = express.Router();
const commandCenterController = require('../controllers/commandCenterController');
const { protect } = require('../middleware/auth');

router.use(protect);

// UI View
router.get('/', commandCenterController.renderSupervisorCommandCenter);

// API Endpoints
router.get('/api/events/:id', commandCenterController.getEventDetail);

module.exports = router;
