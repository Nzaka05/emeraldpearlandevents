/**
 * adminCommandCenterRoutes.js
 * Routes for the Admin Command Center (Port 3000)
 */
const express = require('express');
const router = express.Router();
const adminCommandCenterController = require('../controllers/adminCommandCenterController');
const { verifyAdminPage } = require('../middleware/adminAuth');

router.use(verifyAdminPage); // Protect all routes

// UI View
router.get('/', adminCommandCenterController.renderCommandCenter);

// API Endpoints
router.get('/api/metrics', adminCommandCenterController.getMetrics);
router.get('/api/events', adminCommandCenterController.getActiveEvents);
router.get('/api/events/:id', adminCommandCenterController.getEventDetail);

module.exports = router;
