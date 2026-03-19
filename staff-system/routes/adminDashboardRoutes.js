/**
 * adminDashboardRoutes.js
 * Routes: Dashboard analytics, Audit Logs, Security, Leaderboard
 * Mount prefix: /portal/admin-staff  (all URLs stay identical to the old admin.js)
 */

const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/adminDashboardController');
const { protect, authorize } = require('../middleware/auth');

// ── Apply auth to every route in this file ────────────────────
router.use(protect, authorize('Admin'));

// ── EJS page views ────────────────────────────────────────────
router.get('/dashboard',        ctrl.getDashboard);
router.get('/audit-logs-page',  ctrl.getAuditLogsPage);
router.get('/security',         ctrl.getSecurityPage);
router.get('/leaderboard',      ctrl.getLeaderboardPage);

// ── JSON API ──────────────────────────────────────────────────
router.get('/audit-logs',       ctrl.getAuditLogs);

module.exports = router;
