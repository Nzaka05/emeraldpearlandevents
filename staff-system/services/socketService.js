/**
 * socketService.js
 * Socket.IO event emitters for real-time metric updates and notifications
 */

const io = require('../config/socket');

/**
 * Emit metric update to connected clients
 * @param {string} metricType - Type of metric (e.g., 'staff_count', 'payment_status')
 * @param {object} data - Metric data to broadcast
 */
function emitMetricUpdate(metricType, data) {
    if (!io) {
        console.warn('[socketService] Socket.IO not initialized, skipping emit');
        return;
    }
    try {
        io.emit(`metric:${metricType}`, {
            timestamp: new Date(),
            data
        });
    } catch (error) {
        console.error('[socketService] Error emitting metric update:', error.message);
    }
}

/**
 * Emit notification to specific admin/supervisor
 * @param {string} recipientId - User ID to notify
 * @param {object} notification - Notification object
 */
function emitNotification(recipientId, notification) {
    if (!io) {
        console.warn('[socketService] Socket.IO not initialized, skipping notification');
        return;
    }
    try {
        io.to(`user:${recipientId}`).emit('notification', {
            timestamp: new Date(),
            ...notification
        });
    } catch (error) {
        console.error('[socketService] Error emitting notification:', error.message);
    }
}

/**
 * Emit assignment update event
 * @param {string} assignmentId - Assignment ID
 * @param {object} update - Update object
 */
function emitAssignmentUpdate(assignmentId, update) {
    if (!io) return;
    try {
        io.emit(`assignment:${assignmentId}:update`, {
            timestamp: new Date(),
            ...update
        });
    } catch (error) {
        console.error('[socketService] Error emitting assignment update:', error.message);
    }
}

module.exports = {
    emitMetricUpdate,
    emitNotification,
    emitAssignmentUpdate
};
