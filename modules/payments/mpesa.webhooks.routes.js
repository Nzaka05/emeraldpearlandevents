/**
 * M-Pesa Webhooks Routes
 * Relocated from payments.routes.js to bypass global CSRF protection
 */

const express = require('express');
const router = express.Router();
const controller = require('./payments.controller');

// PUBLIC routes (no auth or CSRF required for Safaricom callbacks)
router.post('/callback', (req, res) => controller.mpesaCallback(req, res));
router.post('/timeout', (req, res) => controller.mpesaTimeout(req, res));

module.exports = router;
