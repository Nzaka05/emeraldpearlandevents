/**
 * aiAnalyticsController.js
 * Provides aggregation data for the AI Analytics Dashboard
 * and renders AI views.
 */

const AIInsight      = require('../staff-system/ai-learning/models/AIInsight');
const AITrainingLog  = require('../staff-system/ai-learning/models/AITrainingLog');
const AIFeedback     = require('../staff-system/ai-learning/models/AIFeedback');
const Assignment     = require('../staff-system/models/Assignment');

/**
 * GET /portal/admin-staff/ai/analytics
 * Returns aggregated learning metrics as JSON.
 */
exports.getAnalyticsData = async (req, res) => {
    try {
        // 1. All Insights summary
        const insights = await AIInsight.find().lean();
        const totalInsights = insights.length;
        const avgConfidence = totalInsights > 0
            ? Math.round(insights.reduce((s, i) => s + (i.confidence || 0), 0) / totalInsights)
            : 0;
        const totalSampleSize = insights.reduce((s, i) => s + (i.sample_size || 0), 0);

        // 2. Training Logs
        const trainingLogs = await AITrainingLog.find().sort({ processed_at: -1 }).limit(50).lean();
        const successCount = trainingLogs.filter(l => l.status === 'Success').length;
        const failedCount = trainingLogs.filter(l => l.status === 'Failed').length;

        // 3. Feedback
        const feedback = await AIFeedback.find().lean();
        const accurateFeedback = feedback.filter(f => f.marked_accurate).length;
        const inaccurateFeedback = feedback.filter(f => !f.marked_accurate).length;

        // 4. Confidence Trend (per insight type)
        const confidenceTrend = insights.map(i => ({
            type: i.type,
            reference_id: i.reference_id,
            confidence: i.confidence,
            sample_size: i.sample_size,
            last_updated: i.last_updated
        }));

        // 5. Insight Breakdown by type
        const insightsByType = {};
        insights.forEach(i => {
            if (!insightsByType[i.type]) insightsByType[i.type] = [];
            insightsByType[i.type].push({
                reference_id: i.reference_id,
                metrics: i.metrics,
                confidence: i.confidence,
                sample_size: i.sample_size,
                anomalies: i.anomalies || []
            });
        });

        // 6. Predicted vs Actual snapshots (from event-type insights)
        const eventTypeInsights = insights.filter(i => i.type === 'event-type');
        const predVsActual = eventTypeInsights.map(i => ({
            eventType: i.reference_id,
            avgStaffCount: i.metrics?.staffCount || 0,
            avgCost: i.metrics?.cost || 0,
            avgProfit: i.metrics?.profit || 0,
            sampleSize: i.sample_size
        }));

        return res.json({
            success: true,
            data: {
                summary: {
                    totalInsights,
                    avgConfidence,
                    totalSampleSize,
                    eventsProcessed: successCount,
                    eventsFailed: failedCount,
                    feedbackAccurate: accurateFeedback,
                    feedbackInaccurate: inaccurateFeedback
                },
                confidenceTrend,
                insightsByType,
                predVsActual,
                recentTrainingLogs: trainingLogs.slice(0, 20)
            }
        });
    } catch (error) {
        console.error('[AIAnalytics] Error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * Render: AI Command Center View
 */
exports.renderCommandCenter = async (req, res) => {
    try {
        const assignments = await Assignment.find({
            $or: [
                { lifecycle_state: { $in: ['LIVE', 'READY', 'STAFFING', 'PLANNED'] } },
                { status: 'Active' }
            ]
        }).select('_id title location lifecycle_state status').lean();

        const events = assignments.map(a => ({
            id: a._id,
            title: a.title || 'Untitled Event',
            location: a.location || 'N/A',
            state: a.lifecycle_state || a.status || 'PLANNED'
        }));

        res.render('admin/ai-command-center', {
            user: req.user,
            events,
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
    } catch (error) {
        console.error('[AICommandCenter] Render Error:', error);
        res.status(500).send('Failed to load AI Command Center');
    }
};

/**
 * Render: AI Analytics View
 */
exports.renderAnalytics = async (req, res) => {
    try {
        res.render('admin/ai-analytics', {
            user: req.user,
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
    } catch (error) {
        console.error('[AIAnalytics] Render Error:', error);
        res.status(500).send('Failed to load AI Analytics');
    }
};
