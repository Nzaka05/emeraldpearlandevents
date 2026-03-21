require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Staff = require('./staff-models/Staff');
    const updates = [
        { email: 'nzakagideon05@gmail.com', title: 'Co-CEO / IT Director', roles: ['Admin', 'Staff'] },
        { email: 'abuorcharles96@gmail.com', title: 'Director', roles: ['Admin', 'Staff'] },
        { email: 'nzakajoshua@gmail.com', title: 'CEO', roles: ['Admin', 'Staff'] }
    ];
    for (const u of updates) {
        const result = await Staff.findOneAndUpdate(
            { email: u.email },
            { title: u.title, dualRole: true },
            { new: true }
        );
        if (result) console.log('Updated:', result.email, u.title);
        else console.log('Not found:', u.email);
    }
    mongoose.disconnect();
});
