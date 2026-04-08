/**
 * Payments Routes
 * Route definitions ONLY — no business logic, no req/res handling beyond middleware
 */

const express = require('express');
const router = express.Router();
const { verifyAdminJWT } = require('../../server/middleware/adminAuth');
const controller = require('./payments.controller');

/**
 * ═══════════════════════════════════════════════════════════
 * PAYMENTS ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// PUBLIC routes (no auth required for Safaricom callbacks)
router.post('/mpesa/callback', (req, res) => controller.mpesaCallback(req, res));
router.post('/mpesa/timeout', (req, res) => controller.mpesaTimeout(req, res));

// PROTECTED routes (auth required)
router.get('/', verifyAdminJWT, (req, res) => controller.list(req, res));
router.get('/:id', verifyAdminJWT, (req, res) => controller.getById(req, res));
router.put('/:id/status', verifyAdminJWT, (req, res) => controller.updateStatus(req, res));
router.put('/:assignmentId/mark-received/:staffPaymentId', verifyAdminJWT, (req, res) => controller.markReceived(req, res));

// STK Push operations
router.post('/stk-push', verifyAdminJWT, (req, res) => controller.initiateStk(req, res));
router.get('/status/:conversationId', verifyAdminJWT, (req, res) => controller.checkStatus(req, res));

module.exports = router;
