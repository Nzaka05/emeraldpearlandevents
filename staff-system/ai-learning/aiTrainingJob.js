/**
 * aiTrainingJob.js
 * 
 * Scheduled or manually triggerable job to update AI learning models.
 * Uses a batching queue approach to ensure the server is not overloaded.
 */

const Assignment = require('../models/Assignment');
const AITrainingLog = require('./models/AITrainingLog');
const aiLearningService = require('./aiLearningService');

const BATCH_SIZE = 5;

/**
 * Run the training job
 * Fetches completed events that do not have a training log entry.
 */
async function runTrainingBatch() {
    console.log('[AITrainingJob] Starting batch processing for completed events...');

    // Find completed events
    // Assuming lifecycle_state = 'COMPLETED' or status = 'Completed'
    const pendingEvents = await Assignment.find({
        $or: [
            { lifecycle_state: 'COMPLETED' },
            { lifecycle_state: 'FINANCE_SETTLED' },
            { status: 'Completed' }
        ]
    }).select('_id').lean();

    const pendingIds = pendingEvents.map(e => e._id);

    // Find which ones already ran
    const completedLogs = await AITrainingLog.find({
        event_id: { $in: pendingIds }
    }).select('event_id').lean();

    const completedIds = new Set(completedLogs.map(l => l.event_id.toString()));

    // Filter to exactly those that haven't been processed
    const toProcess = pendingIds.filter(id => !completedIds.has(id.toString()));

    if (toProcess.length === 0) {
        console.log('[AITrainingJob] No new events pending training.');
        return { processed: 0, failed: 0 };
    }

    const batch = toProcess.slice(0, BATCH_SIZE);
    console.log(`[AITrainingJob] Found ${toProcess.length} pending events. Processing batch of ${batch.length}`);

    let processedCount = 0;
    let failedCount = 0;

    for (const eventId of batch) {
        try {
            // First, lock it by creating a pending log entry to prevent race condition
            // In a highly concurrent system we'd use a unique index, which we do have on AITrainingLog.event_id
            await AITrainingLog.create({
                event_id: eventId,
                status: 'Processing'
            });

            // Run the actual insight update
            await aiLearningService.updateInsights(eventId);

            // Mark Success
            await AITrainingLog.updateOne(
                { event_id: eventId },
                { $set: { status: 'Success', processed_at: new Date(), details: { processed: true } } }
            );
            processedCount++;
        } catch (error) {
            console.error(`[AITrainingJob] Failed processing event ${eventId}:`, error.message);
            // Mark Fail so it can be manually retried or investigated
            await AITrainingLog.updateOne(
                { event_id: eventId },
                { $set: { status: 'Failed', processed_at: new Date(), details: { error: error.message } } },
                { upsert: true }
            );
            failedCount++;
        }
    }

    console.log(`[AITrainingJob] Batch completed. Success: ${processedCount}. Failed: ${failedCount}.`);
    return { processed: processedCount, failed: failedCount };
}

module.exports = {
    runTrainingBatch
};
