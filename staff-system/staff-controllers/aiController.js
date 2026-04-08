/**
const respond = require('../../utils/respond');
 * aiController.js
 */

const aiAssistantService = require('../services/aiAssistantService');
const AIFeedback = require('../ai-learning/models/AIFeedback');

exports.queryAssistant = async (req, res) => {
    try {
        const { query, eventContext } = req.body;
        if (!req.user) return respond(res, 401, { success: false, message: 'Unauthorized' });

        const userId = req.user._id;
        const role = req.user.role;

        if (!query) return respond(res, 400, { success: false, message: 'Query is required' });

        const result = await aiAssistantService.processAssistantQuery(userId, role, query, eventContext || {}, req.body.history || []);
        
        return respond(res, 200, {
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[AIController] queryAssistant Error:', error);
        return respond(res, 500, { success: false, message: 'Internal Server Error', error: error.message });
    }
};

exports.submitFeedback = async (req, res) => {
    try {
        const { event_id, prediction_id, marked_accurate, comments } = req.body;
        if (!req.user) return respond(res, 401, { success: false, message: 'Unauthorized' });
        const userId = req.user._id;

        await AIFeedback.create({
            event_id,
            prediction_id,
            marked_accurate,
            comments,
            feedback_by: userId
        });

        return respond(res, 200, { success: true, message: 'Feedback logged.' });
    } catch (error) {
        console.error('[AIController] submitFeedback Error:', error);
        return respond(res, 500, { success: false, message: 'Internal Server Error' });
    }
};
