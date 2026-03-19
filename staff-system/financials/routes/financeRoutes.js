/**
 * Emerald Pearl Events - Financial HTTP Routes
 */
const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { protect, authorize } = require('../../middleware/auth');

// Apply protection and specific roles to all routes in this module
router.use(protect);

// Dashboards and read APIs (Admins and optionally Supervisors depending on route)
router.get('/ledger/:eventId', authorize('Admin', 'Super Admin'), financeController.getEventLedger);

// Emergency & Expenses
router.post('/expenses/emergency', authorize('Supervisor', 'Admin', 'Super Admin'), financeController.requestEmergencyFund);
router.post('/expenses/:id/approve', authorize('Admin', 'Super Admin'), financeController.approveEmergencyFund);

// Payroll 
router.post('/payroll/generate/:eventId', authorize('Admin', 'Super Admin'), financeController.generatePayroll);
router.post('/payroll/:id/pay', authorize('Admin', 'Super Admin'), financeController.executePayout);

module.exports = router;
