const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    actionType: { type: String, required: true }, // e.g., 'LOGIN_SUCCESS', 'PASSWORD_RESET', 'ACCOUNT_UPDATED', 'PAYMENT_SENT', 'ACCOUNT_SUSPENDED'
    targetModel: { type: String, enum: ['Staff', 'Assignment', 'EventTeam', 'System', 'AIAction', 'AIAlert', 'ClientInvoice', 'EventLedger', 'EventPredictionSnapshot'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, refPath: 'targetModel' }, // Optional, can be null for system-level
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }, // Can be null if automated or guest (e.g., failed login)
    details: { type: mongoose.Schema.Types.Mixed }, // Flexible JSON for arbitrary data changes
    ipAddress: { type: String },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
