/**
 * queue/queues.js — BullMQ queue definitions
 *
 * All queues share a single ioredis connection (separate from Workers).
 * Default job options enforce exponential backoff and bounded storage.
 */

const { Queue } = require('bullmq');
const { createTrackedConnection } = require('./connection');

// Single shared connection for all queues (not workers)
const queueConnection = createTrackedConnection('queue-publisher');

/** Default job options applied to every queue */
const DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 200,
};

const paymentQueue = new Queue('payment', {
    connection: queueConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

const notificationQueue = new Queue('notification', {
    connection: queueConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

const emailQueue = new Queue('email', {
    connection: queueConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

const systemEventsQueue = new Queue('systemEvents', {
    connection: queueConnection,
    defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 1,          // System events are advisory — do not retry
        removeOnComplete: 50,
    },
});

module.exports = {
    paymentQueue,
    notificationQueue,
    emailQueue,
    systemEventsQueue,
    DEFAULT_JOB_OPTIONS,
};
