require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // staff-system uses bcryptjs, wait let's use bcrypt js or standard bcrypt? We'll use bcryptjs as it's in staff-system package.json likely, or just check whatever is available. Let's use standard bcrypt just in case, or bcryptjs. Let's require the Staff model and it will use whatever it needs. Actually Staff.js model uses bcrypt?
const Staff = require('./models/Staff');

async function seedTestAccounts() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/emerald';
        console.log('Connecting to: ', mongoUri);
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            maxPoolSize: 10,
            retryWrites: true
        });
        console.log('MongoDB connected.');

        const accounts = [
            { name: 'Test Staff', email: 'teststaff@emerald.com', password: 'TestStaff123!', role: 'Staff', status: 'Active', department: 'Operations', phone: '+254700000001' },
            { name: 'Test Supervisor', email: 'testsupervisor@emerald.com', password: 'TestSupervisor123!', role: 'Supervisor', status: 'Active', department: 'Operations', phone: '+254700000002' },
            { name: 'Test Admin', email: 'testadmin@emerald.com', password: 'TestAdmin123!', role: 'Admin', status: 'Active', department: 'Management', phone: '+254700000003' }
        ];

        for (const accountData of accounts) {
            let user = await Staff.findOne({ email: accountData.email });
            if (!user) {
                user = new Staff(accountData);
                const bcrypt = require('bcryptjs');
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(accountData.password, salt);
                await user.save();
                console.log(`Created account: ${accountData.email}`);
            } else {
                const bcrypt = require('bcrypt') || require('bcryptjs');
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(accountData.password, salt);
                user.role = accountData.role;
                await user.save();
                console.log(`Updated password for ${accountData.email}`);
            }
        }
        console.log('Seed complete.');
        process.exit(0);
    } catch (err) {
        console.error('Seed error:', err);
        process.exit(1);
    }
}
seedTestAccounts();
