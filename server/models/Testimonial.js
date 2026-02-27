const mongoose = require('mongoose');

const TestimonialSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    role: {
        type: String,
        default: 'Client'
    },
    avatar: {
        type: String,
        default: null
    },
    text: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        enum: [1, 2, 3, 4, 5],
        default: 5
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'hidden'],
        default: 'pending'
    },
    source: {
        type: String,
        default: 'manual'
    },
    eventType: {
        type: String,
        default: null
    },
    displayOnWebsite: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

TestimonialSchema.index({ status: 1 });

module.exports = mongoose.model('Testimonial', TestimonialSchema);
