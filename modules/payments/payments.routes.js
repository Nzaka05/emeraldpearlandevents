/**
 * Payments Routes
 * Route definitions ONLY — no business logic, no req/res handling beyond middleware
 */

const express = require('express');
const router = express.Router();
const { verifyAdminJWT } = require('../../server/middleware/adminAuth');
const { csrfProtection, csrfErrorHandler } = require('../../server/middleware/csrfProtection');
const controller = require('./payments.controller');

/**
 * ═══════════════════════════════════════════════════════════
 * PAYMENTS ROUTES
 * ═══════════════════════════════════════════════════════════
 */


// PROTECTED routes (auth required)
router.get('/', verifyAdminJWT, (req, res) => controller.list(req, res));
router.get('/:id', verifyAdminJWT, (req, res) => controller.getById(req, res));
router.put('/:id/status', verifyAdminJWT, csrfProtection, csrfErrorHandler, (req, res) => controller.updateStatus(req, res));
router.put('/:assignmentId/mark-received/:staffPaymentId', verifyAdminJWT, csrfProtection, csrfErrorHandler, (req, res) => controller.markReceived(req, res));

// STK Push operations
router.post('/stk-push', verifyAdminJWT, csrfProtection, csrfErrorHandler, (req, res) => controller.initiateStk(req, res));
router.get('/status/:conversationId', verifyAdminJWT, (req, res) => controller.checkStatus(req, res));

module.exports = router;
