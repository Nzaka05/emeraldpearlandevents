const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Assignment = require('./models/Assignment');
  const Staff = require('./models/Staff');
  const assignments = await Assignment.find({ 'staff_payments.0': { $exists: true } });
  console.log('Assignments with staff_payments:', assignments.length);
  for (const a of assignments) {
    let updated = false;
    for (const sp of a.staff_payments) {
      if (!sp.phone || sp.phone === '') {
        const staff = await Staff.findById(sp.staff_id).select('phone').lean();
        if (staff && staff.phone) {
          sp.phone = staff.phone;
          updated = true;
          console.log('Fixed phone for:', sp.staff_name, '->', staff.phone);
        }
      }
    }
    if (updated) await a.save();
  }
  console.log('Done');
  process.exit();
});
