/**
 * aiRoutes.js
 * 
 * Defines endpoints for the AI Assistant, Learning feedback loop,
 * action execution, and analytics.
 * Hardened with rate limiting and role-based auth.
 */

const express = require('express');
const router = express.Router();
const aiController = require('../staff-controllers/aiController');
const { protect, authorize } = require('../staff-middleware/auth');
const { aiAssistantLimiter, aiActionLimiter } = require('../staff-middleware/aiRateLimiter');

// All AI routes require authentication
router.use(protect);

router.post('/assistant', aiAssistantLimiter, aiController.queryAssistant);
router.post('/feedback', aiActionLimiter, authorize('Admin'), aiController.submitFeedback);
router.post('/action/execute', aiActionLimiter, authorize('Admin'), aiController.executeAction);

module.exports = router;
