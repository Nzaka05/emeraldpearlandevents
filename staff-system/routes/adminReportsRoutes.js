/**
 * adminReportsRoutes.js
 * Routes: Reports page, PDF/CSV exports
 * Mount prefix: /portal/admin-staff  (all URLs stay identical to the old admin.js)
 */

const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/adminReportsController');
const { protect, authorize } = require('../middleware/auth');

// ── Apply auth to every route in this file ────────────────────
router.use(protect, authorize('Admin'));

// ── EJS page views ────────────────────────────────────────────
router.get('/reports', ctrl.getReportsPage);

// ── Export endpoints ──────────────────────────────────────────
router.get('/assignments/:id/report/export', ctrl.exportReport);

module.exports = router;
