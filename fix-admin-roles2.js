require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Staff = require('./staff-models/Staff');
    
    // Fix Joshua
    await Staff.findOneAndUpdate(
        { email: 'joshnzaka@icloud.com' },
        { role: 'Admin', title: 'CEO', dualRole: true, status: 'Active', mustChangePassword: true },
        { new: true }
    ).then(r => console.log('Joshua:', r ? 'Updated' : 'Not found'));

    // Update Gideon and David with titles
    await Staff.findOneAndUpdate(
        { email: 'nzakagideon05@gmail.com' },
        { title: 'Co-CEO / IT Director', dualRole: true }
    ).then(r => console.log('Gideon:', r ? 'Updated' : 'Not found'));

    await Staff.findOneAndUpdate(
        { email: 'abuorcharles96@gmail.com' },
        { title: 'Director', dualRole: true }
    ).then(r => console.log('David:', r ? 'Updated' : 'Not found'));

    mongoose.disconnect();
});
