const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const pricingSchema = new mongoose.Schema({
    vatRate: { type: Number, default: 16 },
    currency: { type: String, default: 'KES' },
    globalSupervisorRate: { type: Number, default: 5000 },
    paymentMethods: [{ name: String, details: String, icon: String, isActive: Boolean }],
    categories: [{ name: String, companyUniformRate: Number, cateredUniformRate: Number, staffPayRate: Number, supervisorRate: Number, unit: String, isActive: Boolean }],
    notes: String,
    updatedBy: String
  }, { timestamps: true });
  const PS = mongoose.models.PricingSettings || mongoose.model('PricingSettings', pricingSchema);
  await PS.deleteMany({});
  await PS.create({
    vatRate: 16, currency: 'KES', globalSupervisorRate: 5000,
    categories: [
      { name: 'Airport Pickups', companyUniformRate: 3500, cateredUniformRate: 3500, staffPayRate: 2000, isActive: true },
      { name: 'Birthday Parties', companyUniformRate: 3000, cateredUniformRate: 2600, staffPayRate: 1800, isActive: true },
      { name: 'Brand Ambassadors', companyUniformRate: 4000, cateredUniformRate: 3500, staffPayRate: 2500, isActive: true },
      { name: 'Club Hostesses', companyUniformRate: 2500, cateredUniformRate: 6000, staffPayRate: 2000, isActive: true },
      { name: 'Cover Models', companyUniformRate: 6000, cateredUniformRate: 6000, staffPayRate: 4000, isActive: true },
      { name: 'Event Hostesses', companyUniformRate: 3000, cateredUniformRate: 2500, staffPayRate: 2000, isActive: true },
      { name: 'Launches', companyUniformRate: 3500, cateredUniformRate: 3000, staffPayRate: 2200, isActive: true },
      { name: 'Protocol', companyUniformRate: 3500, cateredUniformRate: 3000, staffPayRate: 2200, isActive: true },
      { name: 'Registry', companyUniformRate: 3000, cateredUniformRate: 2000, staffPayRate: 1800, isActive: true },
      { name: 'Vixens', companyUniformRate: 6000, cateredUniformRate: 6000, staffPayRate: 4000, isActive: true },
      { name: 'Weddings/Ruracio/Burials', companyUniformRate: 3500, cateredUniformRate: 3000, staffPayRate: 2200, isActive: true },
      { name: 'Corporate Events', companyUniformRate: 5000, cateredUniformRate: 4000, staffPayRate: 3000, isActive: true },
      { name: 'Waiters/Waitresses', companyUniformRate: 2500, cateredUniformRate: 2000, staffPayRate: 1500, isActive: true },
      { name: 'Chauffeur/Bouncers', companyUniformRate: 6000, cateredUniformRate: 5000, staffPayRate: 4000, isActive: true },
      { name: 'Family/House Parties', companyUniformRate: 3500, cateredUniformRate: 4000, staffPayRate: 2200, isActive: true },
      { name: 'Dancers', companyUniformRate: 30000, cateredUniformRate: 30000, staffPayRate: 20000, isActive: true }
    ],
    paymentMethods: [
      { name: 'MPesa', details: 'Till/Paybill: 247247', icon: 'fa-mobile-screen-button', isActive: true },
      { name: 'Bank Transfer', details: 'Equity Bank', icon: 'fa-building-columns', isActive: true },
      { name: 'Cash', details: 'Physical payment', icon: 'fa-money-bills', isActive: true },
      { name: 'PayPal', details: 'payments@emeraldpearland.com', icon: 'fa-paypal', isActive: false },
      { name: 'Card', details: 'Visa / Mastercard', icon: 'fa-credit-card', isActive: false }
    ]
  });
  console.log('PricingSettings seeded to emerald DB');
  process.exit();
});
