const mongoose = require('mongoose');

const RateLimitEntrySchema = new mongoose.Schema({
    key: { type: String, required: true, index: true },
    count: { type: Number, default: 1 },
    firstRequestAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
});

// TTL index — MongoDB auto-deletes after expiresAt
RateLimitEntrySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.RateLimitEntry ||
    mongoose.models.RateLimitEntry || mongoose.model('RateLimitEntry', RateLimitEntrySchema);

