/**
 * aiRoutes.js
 * 
 * Defines endpoints for the AI Assistant and Learning feedback loop.
 */

const express = require('express');
const router = express.Router();
const aiController = require('../staff-controllers/aiController');
const { protect, authorize } = require('../middleware/auth');

router.post('/assistant', protect, authorize('Admin', 'Supervisor'), aiController.queryAssistant);
router.post('/feedback', protect, authorize('Admin', 'Supervisor'), aiController.submitFeedback);

module.exports = router;
