const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const adminPerformanceController = require('../controllers/performanceController');
const supervisorPerformanceController = require('../controllers/supervisorPerformanceController');

// ─────────────────────────────────────────────────────────────
// SUPERVISOR ENDPOINTS
// ─────────────────────────────────────────────────────────────

// Get pending staff reviews for a specific event
router.get('/portal/supervisor/events/:eventId/reviews/pending', protect, authorize('Supervisor', 'Admin'), supervisorPerformanceController.getPendingReviews);

// Batch submit reviews for an event
router.post('/portal/supervisor/events/:eventId/reviews/submit', protect, authorize('Supervisor', 'Admin'), supervisorPerformanceController.submitBatchReviews);

// ─────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────

// Admin Dashboard UI View (HTML)
router.get('/portal/admin-staff/performance', protect, authorize('Admin'), adminPerformanceController.renderDashboard);

// Admin Dashboard Data (JSON)
router.get('/portal/admin-staff/performance/data', protect, authorize('Admin'), adminPerformanceController.getDashboardData);

// Individual Staff Performance Profile
router.get('/portal/admin-staff/performance/staff/:id', protect, authorize('Admin'), adminPerformanceController.getStaffProfile);

// Supervisor Rankings
router.get('/portal/admin-staff/performance/supervisors', protect, authorize('Admin'), adminPerformanceController.getSupervisors);

// Add disciplinary flag
router.post('/portal/admin-staff/performance/flag/:staffId', protect, authorize('Admin'), adminPerformanceController.flagStaff);

// Reopen review window (Admin override)
router.post('/portal/admin-staff/performance/reviews/reopen/:eventId', protect, authorize('Admin'), adminPerformanceController.reopenReviewWindow);

module.exports = router;
