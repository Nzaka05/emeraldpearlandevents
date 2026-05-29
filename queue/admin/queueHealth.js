/**
 * queue/admin/queueHealth.js — Admin API for queue monitoring
 *
 * GET /api/v1/admin/security/queue-health
 *
 * Returns waiting, active, completed, failed, and delayed counts
 * for all BullMQ queues + recent DLQ entries.
 */

const express = require('express');
const router = express.Router();
const DeadLetterJob = require('../models/DeadLetterJob');

/**
 * Mount this router under the admin security routes.
 * Requires admin JWT + role check externally.
 */
router.get('/queue-health', async (req, res) => {
    try {
        // Lazy-load queues to avoid circular deps during startup
        const { paymentQueue, notificationQueue, emailQueue, systemEventsQueue } = require('../queues');

        const [paymentCounts, notificationCounts, emailCounts, systemCounts] = await Promise.all([
            paymentQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
            notificationQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
            emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
            systemEventsQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
        ]);

        // Recent DLQ entries (last 24 hours)
        const recentDlq = await DeadLetterJob.find({
            failedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
            .sort({ failedAt: -1 })
            .limit(10)
            .lean();

        const totalDlq = await DeadLetterJob.countDocuments();

        res.json({
            success: true,
            data: {
                queues: {
                    payment: paymentCounts,
                    notification: notificationCounts,
                    email: emailCounts,
                    systemEvents: systemCounts,
                },
                deadLetterQueue: {
                    total: totalDlq,
                    recent: recentDlq,
                },
                timestamp: new Date().toISOString(),
            }
        });
    } catch (err) {
        console.error('[QueueHealth] Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch queue health',
            message: err.message,
        });
    }
});

module.exports = router;
