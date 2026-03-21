require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Staff = require('./staff-models/Staff');
    const staff = await Staff.find({ $or: [{ password: null }, { password: { $exists: false } }, { role: null }, { status: null }] });
    for (const s of staff) {
        if (!s.password && s.email) s.password = s.email;
        if (!s.role) s.role = 'Staff';
        if (!s.status) s.status = 'Active';
        s.mustChangePassword = true;
        await s.save();
        console.log('Fixed:', s.email);
    }
    console.log('Done. Fixed', staff.length, 'staff members');
    mongoose.disconnect();
});
