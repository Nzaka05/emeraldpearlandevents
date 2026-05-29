/**
 * queue/events.js — Event type constants and payload contracts
 *
 * All payloads are wrapped in a versioned envelope for forward compatibility.
 * metadata.source identifies which process produced the event.
 */

const crypto = require('crypto');

// ── Event Type Constants ─────────────────────────────────────────────────────

const EventTypes = {
    // Payment queue
    PROCESS_PAYMENT: 'PROCESS_PAYMENT',

    // Notification queue
    SEND_NOTIFICATION: 'SEND_NOTIFICATION',

    // Email queue
    SEND_EMAIL: 'SEND_EMAIL',

    // System events (Socket.io bridge)
    PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    DLQ_INSERTION: 'DLQ_INSERTION',
};

// ── Sources ──────────────────────────────────────────────────────────────────

const Sources = {
    PORT_3000: 'port-3000',
    PORT_3001: 'port-3001',
    WORKER: 'worker',
    RECOVERY: 'recovery',
};

// ── Envelope Factory ─────────────────────────────────────────────────────────

/**
 * Wrap a payload in a versioned event envelope.
 *
 * @param {string} type        — one of EventTypes
 * @param {object} payload     — event-specific data
 * @param {string} source      — one of Sources
 * @param {string} [correlationId] — optional correlation ID (defaults to random UUID)
 * @returns {{ version: number, type: string, payload: object, metadata: object }}
 */
function createEnvelope(type, payload, source, correlationId) {
    return {
        version: 1,
        type,
        payload,
        metadata: {
            timestamp: new Date().toISOString(),
            correlationId: correlationId || crypto.randomUUID(),
            source,
        },
    };
}

// ── JSDoc Type Definitions ───────────────────────────────────────────────────

/**
 * @typedef {Object} ProcessPaymentPayload
 * @property {string}  bookingRef     — booking reference ID
 * @property {number}  amount         — payment amount
 * @property {string}  currency       — currency code (e.g. 'KES')
 * @property {string}  paymentMethod  — payment method (e.g. 'MPesa')
 * @property {string}  idempotencyKey — unique key for deduplication
 * @property {number}  retryCount     — number of prior attempts
 */

/**
 * @typedef {Object} SendNotificationPayload
 * @property {string}  notificationId — unique notification ID for dedup
 * @property {string}  channel        — 'email' | 'sms' | 'push'
 * @property {string}  recipient      — email address, phone number, or push token
 * @property {string}  subject        — notification subject/title
 * @property {string}  body           — notification body/content
 * @property {Object}  [data]         — additional template data
 */

/**
 * @typedef {Object} SendEmailPayload
 * @property {string}       to         — recipient email address
 * @property {string}       subject    — email subject
 * @property {string}       template   — template identifier
 * @property {Object}       [data]     — template variables
 */

/**
 * @typedef {Object} PaymentCompletedEvent
 * @property {string}  bookingRef     — booking reference
 * @property {number}  amount         — payment amount
 * @property {string}  currency       — currency code
 * @property {string}  transactionId  — external transaction ID
 * @property {string}  clientRoom     — Socket.io room for the client
 */

/**
 * @typedef {Object} PaymentFailedEvent
 * @property {string}  bookingRef     — booking reference
 * @property {string}  error          — failure reason
 * @property {string}  clientRoom     — Socket.io room for the client
 */

/**
 * @typedef {Object} DeadLetterJobDocument
 * @property {string}  queueName          — originating queue name
 * @property {string}  jobId              — BullMQ job ID
 * @property {string}  jobName            — job name
 * @property {{ idempotencyKey: string, bookingRef: string }} payload — reference only
 * @property {string}  error              — error message
 * @property {Date}    failedAt           — when the job failed
 * @property {number}  attempts           — total attempts made
 * @property {string}  originalTimestamp   — ISO timestamp from metadata
 * @property {Date}    expiresAt          — TTL expiry (30 days)
 */

module.exports = {
    EventTypes,
    Sources,
    createEnvelope,
};
