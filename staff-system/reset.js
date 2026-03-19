require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const A = require('./models/Assignment');
    await A.findOneAndUpdate(
        { 'staff_payments._id': '69b47d380c80510156ba0d06' },
        { $set: {
            'staff_payments.$.status': 'Pending',
            'staff_payments.$.transaction_id': null,
            'staff_payments.$.received_at': null
        }}
    );
    console.log('Reset to Pending');
    process.exit();
});