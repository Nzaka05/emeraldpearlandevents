/**
 * aiActionService.js
 * 
 * Inspects AI context and recommendations to propose structured actions
 * for the Admin or Supervisor to execute. Does not auto-execute.
 * Includes executeAction() for admin-confirmed action dispatch.
 */

const AuditLog = require('../models/AuditLog');

function generateActions(predictionContext) {
    const actions = [];

    const requiredStaff = predictionContext.predictedStaff || 0;
    if (predictionContext.recommendations && predictionContext.recommendations.some(r => r.includes('understaffing'))) {
        actions.push({
            type: 'STAFF_REASSIGNMENT',
            title: 'Trigger Staff Reassignment',
            description: `Event requires ${requiredStaff} staff but is tracking lower. Automate shift offers to best-fit available staff.`,
            requiresAdmin: true,
            endpoint: '/portal/ai/action/execute'
        });
    }

    if (predictionContext.estimatedProfitRange && predictionContext.estimatedProfitRange.max < 0) {
        actions.push({
            type: 'FINANCE_ALERT',
            title: 'Send Invoice Adjustment',
            description: 'This event is projecting a loss. Notify client of pricing adjustment or reduce staffing parameters.',
            requiresAdmin: true,
            endpoint: '/portal/ai/action/execute'
        });
    }

    if (predictionContext.riskLabel === 'CRITICAL' || predictionContext.riskLabel === 'HIGH') {
        actions.push({
            type: 'ESCALATION',
            title: 'Assign Senior Supervisor',
            description: 'Risk score is elevated. Map an elite supervisor to physically anchor this event.',
            requiresAdmin: false,
            endpoint: '/portal/ai/action/execute'
        });
    }

    if (predictionContext.riskScore >= 50) {
        actions.push({
            type: 'SEND_NOTIFICATION',
            title: 'Alert Supervisors',
            description: 'Send a push notification to all supervisors about this event\'s elevated risk.',
            requiresAdmin: false,
            endpoint: '/portal/ai/action/execute'
        });
    }

    return actions;
}

/**
 * Execute an AI-recommended action.
 * NEVER auto-executes — must be explicitly called by an admin.
 * Every execution is logged to AuditLog.
 */
async function executeAction(actionType, payload, adminId) {
    // Log to AuditLog BEFORE execution
    await AuditLog.create({
        actionType: 'AI_ACTION_EXECUTED',
        targetModel: 'AIAction',
        targetId: payload.event_id || null,
        performedBy: adminId,
        details: {
            action_type: actionType,
            payload,
            timestamp: new Date()
        }
    });

    let result = { success: true, message: '' };

    switch (actionType) {
        case 'assign_staff':
            // In production, this would call staffManagementService or similar
            result.message = `Staff assignment recommendation logged for event ${payload.event_id}. Manual assignment required.`;
            if (global.io) {
                global.io.to('Admin').emit('cmd:ai_action', {
                    type: 'assign_staff',
                    event_id: payload.event_id,
                    message: 'AI recommends additional staff assignment',
                    timestamp: new Date()
                });
            }
            break;

        case 'trigger_emergency_fund':
            result.message = `Emergency fund trigger recommendation logged for event ${payload.event_id}. Amount: KES ${payload.amount || 'N/A'}. Navigate to Emergency Funds to execute.`;
            if (global.io) {
                global.io.to('Admin').emit('cmd:ai_action', {
                    type: 'trigger_emergency_fund',
                    event_id: payload.event_id,
                    amount: payload.amount,
                    timestamp: new Date()
                });
            }
            break;

        case 'send_notification':
            result.message = `Notification dispatched to supervisors about event ${payload.event_id}.`;
            if (global.io) {
                global.io.to('Supervisor').emit('cmd:ai_alert', {
                    event_id: payload.event_id,
                    message: payload.message || 'AI has flagged a risk for your event. Review immediately.',
                    timestamp: new Date()
                });
            }
            break;

        default:
            result = { success: false, message: `Unknown action type: ${actionType}` };
    }

    return result;
}

/**
 * Generate smart auto-suggestions for an event.
 * Pre-fills staff count, budget, and backup recommendations.
 */
async function generateAutoSuggestions(eventId) {
    const suggestions = [];
    try {
        const Assignment = require('../models/Assignment');
        const predictionService = require('./eventPredictionService');
        const assignment = await Assignment.findById(eventId).select('title accepted_staff_ids assigned_staff_ids pay_rate').lean();
        if (!assignment) return suggestions;

        const prediction = await predictionService.generatePrediction(eventId);
        const currentStaff = (assignment.accepted_staff_ids?.length || 0) + (assignment.assigned_staff_ids?.length || 0);

        suggestions.push({
            type: 'staff_count',
            label: 'Optimal Staff Count',
            value: prediction.predictedStaff || currentStaff,
            current: currentStaff,
            reasoning: `Based on ${prediction.confidenceScore || 0}% confidence from historical data`,
            autoFill: { field: 'required_staff', value: prediction.predictedStaff }
        });

        if (prediction.estimatedCostRange) {
            suggestions.push({
                type: 'budget',
                label: 'Suggested Budget Range',
                value: `KES ${prediction.estimatedCostRange.min?.toLocaleString()} – ${prediction.estimatedCostRange.max?.toLocaleString()}`,
                reasoning: 'Derived from similar event cost patterns',
                autoFill: { field: 'budget', value: Math.round((prediction.estimatedCostRange.min + prediction.estimatedCostRange.max) / 2) }
            });
        }

        if (prediction.predictedStaff > currentStaff) {
            suggestions.push({
                type: 'backup_staff',
                label: 'Add Backup Staff',
                value: `+${prediction.predictedStaff - currentStaff} staff needed`,
                reasoning: 'AI predicts higher staffing need than current assignment',
                autoFill: { field: 'additional_staff', value: prediction.predictedStaff - currentStaff }
            });
        }

        if (prediction.riskScore >= 50) {
            suggestions.push({
                type: 'risk_mitigation',
                label: 'Risk Mitigation',
                value: prediction.riskLabel,
                reasoning: `Risk score ${prediction.riskScore}/100 — consider senior supervisor assignment`,
                autoFill: null
            });
        }
    } catch (err) {
        console.error('[AIActionService] generateAutoSuggestions error:', err.message);
    }
    return suggestions;
}

module.exports = {
    generateActions,
    executeAction,
    generateAutoSuggestions
};

