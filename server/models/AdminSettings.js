const mongoose = require('mongoose');

const AdminSettingsSchema = new mongoose.Schema({
    businessName: {
        type: String,
        default: 'Emerald Pearland Events'
    },
    businessPhone: {
        type: String,
        default: '+254 722 446 937'
    },
    businessEmail: {
        type: String,
        default: 'emeraldpearlandevents@gmail.com'
    },
    businessAddress: {
        type: String,
        default: 'Nairobi, Kenya'
    },
    logo: {
        type: String,
        default: 'images/logo.png'
    },
    notifyOnNewBooking: {
        type: Boolean,
        default: true
    },
    notifyOnWhatsApp: {
        type: Boolean,
        default: true
    },
    darkMode: {
        type: Boolean,
        default: false
    },
    currency: {
        type: String,
        default: 'KES'
    },
    timezone: {
        type: String,
        default: 'Africa/Nairobi'
    },
    instagramHandle: { type: String, default: '@emeraldpearlandevents' },
    instagramUrl: { type: String, default: 'https://www.instagram.com/emeraldpearlandevents' },
    facebookUrl: { type: String, default: 'https://www.facebook.com/Emerald.Pearland.Events' },
    beholdfeedId: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('AdminSettings', AdminSettingsSchema);
