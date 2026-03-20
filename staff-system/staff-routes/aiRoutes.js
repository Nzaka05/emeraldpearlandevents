/**
 * aiRoutes.js
 * 
 * Defines endpoints for the AI Assistant and Learning feedback loop.
 */

const express = require('express');
const router = express.Router();
const aiController = require('../staff-controllers/aiController');
// const { ensureAuthenticated } = require('../staff-middleware/auth'); // Assuming existing middleware

// Use a loose auth check for testing, but in production use `ensureAuthenticated`.
const mockAuth = (req, res, next) => {
    if (!req.user) {
        req.user = { _id: '000000000000000000000000', role: 'Admin' };
    }
    next();
};

router.post('/assistant', mockAuth, aiController.queryAssistant);
router.post('/feedback', mockAuth, aiController.submitFeedback);

module.exports = router;
