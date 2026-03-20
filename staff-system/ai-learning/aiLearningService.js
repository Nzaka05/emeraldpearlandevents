/**
 * aiLearningService.js
 * 
 * Core module for AI Learning. Collects event outcomes, applies
 * time-decay weighting, detects anomalies, and merges hierarchical insights.
 */

const AIInsight = require('./models/AIInsight');
const AIFeedback = require('./models/AIFeedback');
const Assignment = require('../models/Assignment');
const Booking = require('../models/SharedBooking');
const ClientInvoice = require('../models/ClientInvoice');
const StaffPerformanceProfile = require('../models/StaffPerformanceProfile');

const LEARNING_VERSION = '1.0.0';
const DECAY_FACTOR = 0.95; // Time-based weighting - older data matters slightly less.

/**
 * Calculates a confidence score 0-100 based on sample size and variance
 */
function calculateConfidence(sampleSize, variance) {
    let score = Math.min((sampleSize / 10) * 50, 60); // Max 60 from sample size
    
    // Variance penalty (assuming variance is standard deviation relative to mean)
    let variancePenalty = Math.min(variance * 100, 40); 
    score += (40 - variancePenalty);
    
    return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Anomaly Detection
 * Flags data points that deviate more than 30% from current insights
 */
function detectAnomalies(actual, expected) {
    const anomalies = [];
    if (!expected) return anomalies;

    if (expected.staffCount && actual.staffCount > 0) {
        const diff = Math.abs(actual.staffCount - expected.staffCount);
        if (diff / expected.staffCount > 0.3) {
            anomalies.push({ metric: 'staffCount', description: `High staff deviation: Expected ${expected.staffCount}, Got ${actual.staffCount}`, detected_at: new Date() });
        }
    }
    if (expected.profit && actual.profit > 0) {
        const diff = Math.abs(actual.profit - expected.profit);
        if (diff / expected.profit > 0.3) {
            anomalies.push({ metric: 'profit', description: `Profit margin deviation: Expected ${expected.profit}, Got ${actual.profit}`, detected_at: new Date() });
        }
    }
    return anomalies;
}

/**
 * Helper to update a single hierarchical insight metric
 */
async function updateSingleInsight(type, referenceId, newMetrics, extractedAnomalies) {
    let insight = await AIInsight.findOne({ type, reference_id: referenceId, model_version: LEARNING_VERSION });
    if (!insight) {
        insight = new AIInsight({
            type,
            reference_id: referenceId,
            model_version: LEARNING_VERSION,
            metrics: newMetrics,
            sample_size: 1,
            confidence: calculateConfidence(1, 0)
        });
        if (extractedAnomalies && extractedAnomalies.length > 0) {
            insight.anomalies = extractedAnomalies;
        }
        await insight.save();
        return;
    }

    // Apply exponential moving average to metrics (time-decay)
    const updatedMetrics = { ...insight.metrics };
    let varianceSum = 0;
    
    for (const key of Object.keys(newMetrics)) {
        if (typeof updatedMetrics[key] === 'number' && typeof newMetrics[key] === 'number') {
            const oldValue = updatedMetrics[key];
            const newValue = newMetrics[key];
            
            // EMA logic
            updatedMetrics[key] = (oldValue * DECAY_FACTOR) + (newValue * (1 - DECAY_FACTOR));
            
            // Track simple variance
            varianceSum += Math.abs((newValue - oldValue) / (oldValue || 1));
        } else {
            updatedMetrics[key] = newMetrics[key]; // Initialize if missing
        }
    }

    insight.metrics = updatedMetrics;
    insight.sample_size += 1;
    
    let avgVariance = varianceSum / (Object.keys(newMetrics).length || 1);
    insight.confidence = calculateConfidence(insight.sample_size, avgVariance);
    insight.last_updated = new Date();
    
    if (extractedAnomalies && extractedAnomalies.length > 0) {
        // Keep last 10 anomalies
        insight.anomalies = [...insight.anomalies, ...extractedAnomalies].slice(-10);
    }
    
    insight.markModified('metrics');
    await insight.save();
}

/**
 * Collect Actual Event Outcome Data
 */
async function collectEventOutcome(eventId) {
    const assignment = await Assignment.findById(eventId).lean();
    if (!assignment) throw new Error('Assignment info not found');

    const booking = assignment.booking_ref ? await Booking.findOne({ bookingReference: assignment.booking_ref }).lean() : null;
    const invoice = await ClientInvoice.findOne({ eventId: eventId }).lean();

    const actualStaffCount = (assignment.accepted_staff_ids || []).length + (assignment.assigned_staff_ids || []).length;
    const actualRevenue = invoice ? invoice.totalAmount : (assignment.clientPaymentAmount || 0);
    
    // Attempt to compute rough hours
    let hours = 6;
    if (assignment.start_time && assignment.end_time) {
        const [sh, sm] = assignment.start_time.split(':').map(Number);
        const [eh, em] = assignment.end_time.split(':').map(Number);
        if (!isNaN(sh) && !isNaN(eh)) {
            let h = (eh + em/60) - (sh + sm/60);
            if (h <= 0) h += 24;
            hours = Math.max(h, 1);
        }
    }
    
    const staffCost = actualStaffCount * (assignment.pay_rate || 1000) * hours;
    const actualCost = staffCost + 5000; // adding temp fixed supervisor cost diff 
    const actualProfit = actualRevenue - actualCost;

    let avgRating = 3.0;
    const staffIds = [...(assignment.accepted_staff_ids || []), ...(assignment.assigned_staff_ids || [])];
    if (staffIds.length > 0) {
        const profiles = await StaffPerformanceProfile.find({ staff_id: { $in: staffIds } }).lean();
        if (profiles.length > 0) {
            avgRating = profiles.reduce((sum, p) => sum + (p.average_overall_score || 3.0), 0) / profiles.length;
        }
    }

    return {
        eventType: booking ? booking.eventType : 'Unknown',
        clientId: assignment.client_id ? assignment.client_id.toString() : 'Unknown',
        staffIds: staffIds.map(id => id.toString()),
        staffCount: actualStaffCount,
        cost: actualCost,
        revenue: actualRevenue,
        profit: actualProfit,
        rating: avgRating
    };
}


/**
 * Fetch Current Hierarchical Insights merged into one object
 */
async function getInsights({ eventType, clientId, staffIds }) {
    const insights = {
        global: await AIInsight.findOne({ type: 'global', reference_id: 'GLOBAL', model_version: LEARNING_VERSION }).lean(),
        eventType: eventType ? await AIInsight.findOne({ type: 'event-type', reference_id: eventType, model_version: LEARNING_VERSION }).lean() : null,
        client: clientId ? await AIInsight.findOne({ type: 'client', reference_id: clientId, model_version: LEARNING_VERSION }).lean() : null,
        staff: []
    };

    if (staffIds && staffIds.length > 0) {
        insights.staff = await AIInsight.find({ type: 'staff', reference_id: { $in: staffIds }, model_version: LEARNING_VERSION }).lean();
    }

    // Merge baseline global -> eventType overrides -> client overrides
    const mergedMetrics = { ...(insights.global?.metrics || {}) };
    
    if (insights.eventType?.metrics) {
        Object.assign(mergedMetrics, insights.eventType.metrics);
        mergedMetrics.confidenceMultiplier = (insights.eventType.confidence / 100);
    }
    if (insights.client?.metrics) {
        // Simple blend of client + eventType
        Object.keys(insights.client.metrics).forEach(k => {
            mergedMetrics[k] = (mergedMetrics[k] + insights.client.metrics[k]) / 2;
        });
        mergedMetrics.clientConfidence = insights.client.confidence;
    }

    return { raw: insights, merged: mergedMetrics };
}


/**
 * Main function triggered locally or by training job
 */
async function updateInsights(eventId) {
    const actual = await collectEventOutcome(eventId);
    const existingInsights = await getInsights({ eventType: actual.eventType, clientId: actual.clientId });
    const anomalies = detectAnomalies(actual, existingInsights.merged);

    // Prepare standard metric set
    const metricSet = {
        staffCount: actual.staffCount,
        cost: actual.cost,
        profit: actual.profit,
        rating: actual.rating
    };

    // 1. Update Global
    await updateSingleInsight('global', 'GLOBAL', metricSet, anomalies);
    
    // 2. Update Event-Type Level
    if (actual.eventType !== 'Unknown') {
        await updateSingleInsight('event-type', actual.eventType, metricSet, anomalies);
    }

    // 3. Update Client Level
    if (actual.clientId !== 'Unknown') {
        await updateSingleInsight('client', actual.clientId, metricSet, anomalies);
    }

    // 4. Update Staff Individual Scores
    for (const sId of actual.staffIds) {
        await updateSingleInsight('staff', sId, { activeEventsDriven: 1, lastRating: actual.rating }, []);
    }

    return true;
}

/**
 * Triggered by any system change (ratings updated, payment flags)
 */
async function triggerRealTimeLearning(triggerType, data) {
    if (triggerType === 'staff_rating') {
        await updateSingleInsight('staff', data.staffId, { lastRating: data.rating }, []);
    }
    if (triggerType === 'payment_issue') {
        await updateSingleInsight('client', data.clientId, { paymentDelays: 1 }, []);
    }
}


module.exports = {
    collectEventOutcome,
    detectAnomalies,
    updateInsights,
    getInsights,
    triggerRealTimeLearning
};
