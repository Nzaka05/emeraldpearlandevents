/**
 * adminStaffRoutes.js
 * Routes: Staff CRUD, suspension, password reset, performance, supervisor, categories
 * Mount prefix: /portal/admin-staff  (all URLs stay identical to the old admin.js)
 */

const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/adminStaffController');
const staffController = require('../controllers/staffController');
const { protect, authorize } = require('../middleware/auth');
const { uploadStaffPhoto } = require('../middleware/upload');
const {
    validateStaffCreation,
    validateStaffUpdate,
    validatePasswordChange,
    sanitizeRequestBody
} = require('../middleware/validation');

// ── Apply auth to every route in this file ────────────────────
router.use(protect, authorize('Admin'));

// ── EJS page views ────────────────────────────────────────────
router.get('/staff-management',    ctrl.getStaffManagementPage);
router.get('/category-settings',   ctrl.getCategorySettingsPage);

// ── Profile management (staffController handles own profile) ──
router.put('/profile',             sanitizeRequestBody, staffController.updateProfile);
router.post('/profile/photo',      uploadStaffPhoto, staffController.uploadProfilePhoto);
router.post('/change-password',    validatePasswordChange, staffController.changeOwnPassword);

// ── Settings page ─────────────────────────────────────────────
router.get('/settings',            staffController.getSettings);

// ── GPS location update ───────────────────────────────────────
router.post('/location',           sanitizeRequestBody, ctrl.updateAdminLocation);

// ── Staff CRUD & management ───────────────────────────────────
router.get('/staff',               ctrl.getAllStaff);
router.post('/staff',              sanitizeRequestBody, validateStaffCreation, uploadStaffPhoto, ctrl.addStaff);
router.put('/staff/:id',           sanitizeRequestBody, validateStaffUpdate, uploadStaffPhoto, ctrl.editStaff);
router.delete('/staff/:id',        ctrl.deleteStaff);
router.put('/staff/:id/suspend',   ctrl.toggleSuspend);
router.post('/staff/:id/reset-password',    ctrl.adminResetPassword);
router.get('/staff/:id/performance',        ctrl.getStaffPerformance);
router.post('/staff/:id/assign-supervisor', protect, authorize('Admin', 'Super Admin'), ctrl.assignSupervisor);
router.get('/staff/:id/card',               ctrl.getStaffCard);

// ── Category settings ─────────────────────────────────────────
router.put('/category-settings',   sanitizeRequestBody, ctrl.updateCategorySettings);

module.exports = router;
