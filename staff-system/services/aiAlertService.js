/**
 * aiAlertService.js
 * Centralized AI alerting — evaluates risk, detects anomalies, triggers alerts.
 */

const AIAlert   = require('../ai-learning/models/AIAlert');
const Assignment = require('../models/Assignment');
const aiLearningService = require('../ai-learning/aiLearningService');
const predictionService = require('./eventPredictionService');

/**
 * Evaluate event risk and create alerts if thresholds are breached.
 */
async function evaluateEventRisk(eventId) {
    const alerts = [];
    try {
        const prediction = await predictionService.generatePrediction(eventId);

        if (prediction.riskScore > 70) {
            alerts.push(await createAlert(eventId, 'HIGH_RISK', 'high',
                `Risk score is ${prediction.riskScore}/100 (${prediction.riskLabel}). Immediate oversight recommended.`,
                { riskScore: prediction.riskScore, riskLabel: prediction.riskLabel }));
        }

        // Staffing gap
        const assignment = await Assignment.findById(eventId).select('accepted_staff_ids assigned_staff_ids').lean();
        const currentStaff = (assignment?.accepted_staff_ids?.length || 0) + (assignment?.assigned_staff_ids?.length || 0);
        if (prediction.predictedStaff > currentStaff + 1) {
            const gap = prediction.predictedStaff - currentStaff;
            alerts.push(await createAlert(eventId, 'STAFFING_GAP', gap > 3 ? 'high' : 'medium',
                `Staffing gap detected: ${currentStaff} assigned vs ${prediction.predictedStaff} predicted (gap: ${gap}).`,
                { currentStaff, predictedStaff: prediction.predictedStaff, gap }));
        }

        // Budget overrun risk
        if (prediction.estimatedProfitRange && prediction.estimatedProfitRange.max < 0) {
            alerts.push(await createAlert(eventId, 'BUDGET_OVERRUN', 'high',
                `Event is projected to lose money. Estimated profit range: KES ${prediction.estimatedProfitRange.min} to ${prediction.estimatedProfitRange.max}.`,
                { profitRange: prediction.estimatedProfitRange }));
        }
    } catch (err) {
        console.error('[AIAlertService] evaluateEventRisk error:', err.message);
    }
    return alerts;
}

/**
 * Detect anomalies for a completed event using learned insights.
 */
async function detectAnomalies(eventId) {
    const alerts = [];
    try {
        const outcome = await aiLearningService.collectEventOutcome(eventId);
        const { merged } = await aiLearningService.getInsights({
            eventType: outcome.eventType,
            clientId: outcome.clientId,
            staffIds: outcome.staffIds
        });
        const anomalies = aiLearningService.detectAnomalies(outcome, merged);

        for (const a of anomalies) {
            alerts.push(await createAlert(eventId, 'ANOMALY', 'medium',
                `Anomaly: ${a.description}`, { metric: a.metric }));
        }
    } catch (err) {
        console.error('[AIAlertService] detectAnomalies error:', err.message);
    }
    return alerts;
}

/**
 * Trigger a custom alert and broadcast via Socket.IO.
 */
async function triggerAlerts(eventId, alertType, payload) {
    const severity = payload.severity || 'medium';
    const alert = await createAlert(eventId, alertType, severity, payload.message, payload.metadata);

    // Broadcast to admin
    if (global.io) {
        global.io.to('Admin').emit('cmd:ai_alert_new', {
            alert_id: alert._id, event_id: eventId, alert_type: alertType,
            severity, message: payload.message, timestamp: new Date()
        });
    }
    return alert;
}

/**
 * Fetch alerts (with optional filters).
 */
const ALLOWED_STATUSES = ['unread', 'read', 'resolved'];

async function getAlerts({ status, severity, limit } = {}) {
    const query = {};
    if (status) {
        if (!ALLOWED_STATUSES.includes(status)) throw new Error('Invalid status filter');
        query.status = status;
    }
    if (severity) query.severity = severity;
    const cappedLimit = Math.min(parseInt(limit) || 20, 100);
    return AIAlert.find(query).sort({ created_at: -1 }).limit(cappedLimit).lean();
}

/**
 * Mark alert as read/resolved.
 */
async function updateAlertStatus(alertId, newStatus) {
    if (!ALLOWED_STATUSES.includes(newStatus)) {
        throw new Error(`Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`);
    }
    return AIAlert.findByIdAndUpdate(alertId, { status: newStatus }, { new: true });
}

/** Internal helper */
async function createAlert(eventId, alertType, severity, message, metadata) {
    // Dedup: don't create same alert type for same event in last hour
    const recent = await AIAlert.findOne({
        event_id: eventId, alert_type: alertType,
        created_at: { $gte: new Date(Date.now() - 3600000) }
    });
    if (recent) return recent;

    const alert = await AIAlert.create({ event_id: eventId, alert_type: alertType, severity, message, metadata });

    if (global.io) {
        global.io.to('Admin').emit('cmd:ai_alert_new', {
            alert_id: alert._id, event_id: eventId, alert_type: alertType,
            severity, message, timestamp: alert.created_at
        });
    }
    return alert;
}

module.exports = { evaluateEventRisk, detectAnomalies, triggerAlerts, getAlerts, updateAlertStatus };

