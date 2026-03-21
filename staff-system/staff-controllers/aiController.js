/**
 * aiController.js
 */

const aiAssistantService = require('../services/aiAssistantService');
const AIFeedback = require('../ai-learning/models/AIFeedback');

exports.queryAssistant = async (req, res) => {
    try {
        const { query, eventContext } = req.body;
        // Mocking robust user identity. 
        // In reality, this relies on req.user injected by auth middleware.
        const userId = req.user ? req.user._id : '000000000000000000000000';
        const role = req.user ? req.user.role : 'Admin'; // Default Admin for testing if not auth'd

        if (!query) return res.status(400).json({ success: false, message: 'Query is required' });

        const result = await aiAssistantService.processAssistantQuery(userId, role, query, eventContext || {}, req.body.history || []);
        
        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[AIController] queryAssistant Error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
    }
};

exports.submitFeedback = async (req, res) => {
    try {
        const { event_id, prediction_id, marked_accurate, comments } = req.body;
        const userId = req.user ? req.user._id : '000000000000000000000000';

        await AIFeedback.create({
            event_id,
            prediction_id,
            marked_accurate,
            comments,
            feedback_by: userId
        });

        return res.status(200).json({ success: true, message: 'Feedback logged.' });
    } catch (error) {
        console.error('[AIController] submitFeedback Error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
