const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Staff = require('./staff-system/models/Staff');

async function createUser() {
    try {
        const uri = 'mongodb+srv://admin:Galaxyimpact.@cluster0.wa8samz.mongodb.net/?appName=Cluster0';
        console.log("Connecting to Atlas...");
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 10000
        });

        const salt = await bcrypt.genSalt(10);
        const password = await bcrypt.hash('password123', salt);

        await Staff.deleteMany({ email: 'admin@emeraldevents.com' });

        const user = await Staff.create({
            name: 'Test Admin',
            email: 'admin@emeraldevents.com',
            password: password,
            role: 'Admin',
            mustChangePassword: false
        });

        console.log("SUCCESS! User created:", user.email);
        process.exit(0);
    } catch (err) {
        console.error("FAILED:", err);
        process.exit(1);
    }
}

createUser();
