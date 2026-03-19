const mongoose = require('mongoose');
require('dotenv').config();

// Both portals use the same Atlas cluster, different env var names
const URI = process.env.MONGO_URI;

mongoose.connect(URI).then(async () => {
  const Assignment = require('./models/Assignment');
  
  // Load PricingSettings directly from the same DB
  const pricingSchema = new mongoose.Schema({ categories: [{ name: String, staffPayRate: Number, isActive: Boolean }] }, { strict: false });
  const PricingSettings = mongoose.models.PricingSettings || mongoose.model('PricingSettings', pricingSchema);
  const pricing = await PricingSettings.findOne().lean();
  
  if (!pricing || !pricing.categories?.length) {
    console.log('No pricing found in DB');
    process.exit();
  }
  console.log('Pricing loaded:', pricing.categories.length, 'categories');
  
  const assignments = await Assignment.find({ booking_ref: { $exists: true, $ne: null } });
  console.log('Assignments to update:', assignments.length);
  
  for (const a of assignments) {
    const title = (a.title || '').toLowerCase();
    const match = pricing.categories.find(c => {
      if (!c.isActive) return false;
      const parts = c.name.toLowerCase().split('/');
      return parts.some(p => title.includes(p.trim()) || p.trim().includes(title.split(' ')[0]));
    });
    if (match) {
      a.pay_rate = match.staffPayRate || a.pay_rate;
      await a.save();
      console.log('Updated:', a.title, '-> KSh', a.pay_rate);
    } else {
      console.log('No match:', a.title);
    }
  }
  process.exit();
});
