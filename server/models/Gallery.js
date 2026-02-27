const mongoose = require('mongoose');

const GallerySchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    caption: {
        type: String,
        default: ''
    },
    order: {
        type: Number,
        default: 0
    },
    eventType: {
        type: String,
        default: null
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

GallerySchema.index({ order: 1 });

module.exports = mongoose.model('Gallery', GallerySchema);
