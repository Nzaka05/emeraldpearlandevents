const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Staff = require('./models/Staff');
  const staff = await Staff.find({}).select('name phone email').lean();
  staff.forEach(s => console.log(s.name, '|', s.phone || 'NO PHONE', '|', s.email));
  process.exit();
});
