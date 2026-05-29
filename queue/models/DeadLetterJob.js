/**
 * queue/models/DeadLetterJob.js — MongoDB model for dead letter queue entries
 *
 * Stores REFERENCE payloads only (idempotencyKey + bookingRef).
 * Full data is always re-queried from MongoDB on retry.
 * 30-day TTL auto-purges resolved entries.
 */

const mongoose = require('mongoose');

const deadLetterJobSchema = new mongoose.Schema({
    queueName: {
        type: String,
        required: true,
        index: true,
    },
    jobId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    jobName: {
        type: String,
        required: true,
    },
    payload: {
        idempotencyKey: { type: String },
        bookingRef: { type: String },
    },
    error: {
        type: String,
        required: true,
    },
    failedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    attempts: {
        type: Number,
        required: true,
    },
    originalTimestamp: {
        type: String,
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        index: { expires: 0 }, // MongoDB TTL index — auto-deletes when expiresAt is reached
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('DeadLetterJob', deadLetterJobSchema);
