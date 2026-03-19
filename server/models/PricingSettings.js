const mongoose = require('mongoose');

const categoryRateSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    companyUniformRate: { type: Number, default: 0 },
    cateredUniformRate: { type: Number, default: 0 },
    staffPayRate: { type: Number, default: 0 },
    supervisorRate: { type: Number, default: 0 },
    unit: { type: String, default: 'per person', enum: ['per event', 'per hour', 'per person', 'per day', 'flat rate'] },
    isActive: { type: Boolean, default: true }
});

const PricingSettingsSchema = new mongoose.Schema({
    vatRate: { type: Number, default: 16 },
    currency: { type: String, default: 'KES' },
    globalSupervisorRate: { type: Number, default: 5000 },
    paymentMethods: [{
        name: { type: String },
        details: { type: String },
        icon: { type: String, default: 'fa-money-bill' },
        isActive: { type: Boolean, default: true }
    }],
    categories: [categoryRateSchema],
    notes: { type: String, default: '' },
    updatedBy: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('PricingSettings', PricingSettingsSchema);
