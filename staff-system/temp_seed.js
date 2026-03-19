const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const Staff = require('./models/Staff');

async function seedTestAccounts() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected.');

        const accounts = [
            {
                name: 'Test Staff',
                email: 'teststaff@emerald.com',
                password: 'TestStaff123!',
                role: 'Staff',
                status: 'Active',
                department: 'Operations',
                phone: '+254700000001'
            },
            {
                name: 'Test Supervisor',
                email: 'testsupervisor@emerald.com',
                password: 'TestSupervisor123!',
                role: 'Supervisor',
                status: 'Active',
                department: 'Operations',
                phone: '+254700000002'
            },
            {
                name: 'Test Admin',
                email: 'testadmin@emerald.com',
                password: 'TestAdmin123!',
                role: 'Admin',
                status: 'Active',
                department: 'Management',
                phone: '+254700000003'
            }
        ];

        for (const accountData of accounts) {
            let user = await Staff.findOne({ email: accountData.email });
            if (!user) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(accountData.password, salt);
                
                user = new Staff({
                    ...accountData,
                    password: hashedPassword
                });
                await user.save();
                console.log(`Created account: ${accountData.email} (${accountData.role})`);
            } else {
                console.log(`Account ${accountData.email} already exists.`);
                // Force update password to ensure we know it
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
