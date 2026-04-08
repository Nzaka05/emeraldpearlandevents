/**
 * Bookings Routes
 * Route definitions ONLY — no business logic, no req/res handling beyond middleware
 */

const express = require('express');
const router = express.Router();
const { verifyAdminJWT } = require('../../server/middleware/adminAuth');
const controllerPath = './bookings.controller';
const controller = require(controllerPath);

/**
 * ═══════════════════════════════════════════════════════════
 * BOOKINGS ROUTES (PROTECTED)
 * ═══════════════════════════════════════════════════════════
 */

// GET /api/v1/admin/bookings
router.get('/', verifyAdminJWT, (req, res) => controller.list(req, res));

// GET /api/v1/admin/bookings/:id
router.get('/:id', verifyAdminJWT, (req, res) => controller.getById(req, res));

// PATCH /api/v1/admin/bookings/:id
router.patch('/:id', verifyAdminJWT, (req, res) => controller.update(req, res));

// PATCH /api/v1/admin/bookings/:id/pay
router.patch('/:id/pay', verifyAdminJWT, (req, res) => controller.updatePayment(req, res));

// POST /api/v1/admin/bookings/:id/payment
router.post('/:id/payment', verifyAdminJWT, (req, res) => controller.recordPayment(req, res));

// POST /api/v1/admin/bookings/:id/send-appreciation
router.post('/:id/send-appreciation', verifyAdminJWT, (req, res) => controller.sendAppreciation(req, res));

// POST /api/v1/admin/bookings/:id/message-staff
router.post('/:id/message-staff', verifyAdminJWT, (req, res) => controller.messageStaff(req, res));

// DELETE /api/v1/admin/bookings/:id
router.delete('/:id', verifyAdminJWT, (req, res) => controller.delete(req, res));

module.exports = router;
