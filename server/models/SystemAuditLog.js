/**
 * server/models/SystemAuditLog.js — System-wide audit trail model
 *
 * Phase 4: Persists categorized audit events for auth, financial, admin,
 * and security actions across all 6 PM2 processes.
 *
 * NOTE: This is SEPARATE from staff-system/models/AuditLog.js which
 * tracks staff-portal-specific audit events. The model name
 * 'SystemAuditLog' avoids Mongoose registration conflicts.
 *
 * TTL: Documents auto-expire after 90 days (7,776,000 seconds).
 */

const mongoose = require('mongoose');

const systemAuditLogSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
    category: {
        type: String,
        enum: ['auth', 'financial', 'admin', 'security'],
        required: true,
        index: true,
    },
    action: {
        type: String,
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    targetModel: {
        type: String,
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
    },
    ip: {
        type: String,
    },
    userAgent: {
        type: String,
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low',
    },
    correlationId: {
        type: String,
    },
});

// TTL index: auto-delete after 90 days (7,776,000 seconds)
systemAuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

// Compound index for category + action queries
systemAuditLogSchema.index({ category: 1, action: 1 });

module.exports = mongoose.model('SystemAuditLog', systemAuditLogSchema);
