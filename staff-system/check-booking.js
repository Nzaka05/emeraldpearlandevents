const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Booking = require('./server/models/Booking');
  const b = await Booking.findOne({ status: 'confirmed' }).lean();
  console.log(JSON.stringify(b, null, 2));
  process.exit();
});
