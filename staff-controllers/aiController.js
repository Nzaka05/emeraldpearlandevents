/**
 * aiController.js
 * Handles AI Assistant queries, feedback, and action execution.
 * HARDENED: No error leaks, no fallback IDs, input validation.
 */

const aiAssistantService = require('../staff-system/services/aiAssistantService');
const aiActionService = require('../staff-system/services/aiActionService');
const AIFeedback = require('../staff-system/ai-learning/models/AIFeedback');
const AuditLog = require('../staff-system/models/AuditLog');
const { isValidObjectId } = require('../staff-system/utils/validateObjectId');

const ALLOWED_ACTION_TYPES = ['assign_staff', 'trigger_emergency_fund', 'send_notification'];

exports.queryAssistant = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { query, eventContext } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ success: false, error: 'Query is required' });
        }

        const sanitizedQuery = query.trim().substring(0, 2000);
        if (sanitizedQuery.length === 0) {
            return res.status(400).json({ success: false, error: 'Query cannot be empty' });
        }

        const result = await aiAssistantService.processAssistantQuery(
            req.user._id, req.user.role, sanitizedQuery, eventContext || {}
        );

        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error('[AIController] queryAssistant Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.submitFeedback = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { event_id, prediction_id, marked_accurate, comments } = req.body;

        // Validate ObjectIds if provided
        if (event_id && !isValidObjectId(event_id)) {
            return res.status(400).json({ success: false, error: 'Invalid event_id' });
        }
        if (prediction_id && !isValidObjectId(prediction_id)) {
            return res.status(400).json({ success: false, error: 'Invalid prediction_id' });
        }
        if (typeof marked_accurate !== 'boolean') {
            return res.status(400).json({ success: false, error: 'marked_accurate must be a boolean' });
        }

        await AIFeedback.create({
            event_id, prediction_id, marked_accurate,
            comments: typeof comments === 'string' ? comments.substring(0, 1000) : '',
            feedback_by: req.user._id
        });

        // Audit log
        await AuditLog.create({
            actionType: 'AI_FEEDBACK_SUBMITTED',
            targetModel: 'AIAction',
            targetId: event_id || null,
            performedBy: req.user._id,
            details: { marked_accurate, prediction_id },
            ipAddress: req.ip
        }).catch(err => console.error('[AuditLog] Feedback log failed:', err.message));

        return res.status(200).json({ success: true, message: 'Feedback logged.' });
    } catch (error) {
        console.error('[AIController] submitFeedback Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.executeAction = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { actionType, payload } = req.body;

        if (!actionType || typeof actionType !== 'string') {
            return res.status(400).json({ success: false, error: 'actionType is required' });
        }

        if (!ALLOWED_ACTION_TYPES.includes(actionType)) {
            return res.status(400).json({
                success: false,
                error: `Invalid actionType. Allowed: ${ALLOWED_ACTION_TYPES.join(', ')}`
            });
        }

        const result = await aiActionService.executeAction(actionType, payload || {}, req.user._id);
        return res.status(200).json(result);
    } catch (error) {
        console.error('[AIController] executeAction Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
