const mongoose = require('mongoose');
const Admin = require('./server/models/Admin');
const Staff = require('./staff-system/models/Staff');
const ClientAccount = require('./server/models/ClientAccount');

async function checkUsers() {
    const uri = 'mongodb+srv://admin:Galaxyimpact.@cluster0.wa8samz.mongodb.net/?appName=Cluster0';
    console.log("Connecting to MongoDB...");
    try {
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("Connected successfully!");

        console.log("\n--- ADMINS ---");
        const admins = await Admin.find({});
        console.log(`Found ${admins.length} admins:`);
        admins.forEach(a => {
            console.log(`- Name: ${a.name}, Email: ${a.email}, Role: ${a.role}, Active: ${a.isActive}`);
        });

        console.log("\n--- STAFF ---");
        const staffList = await Staff.find({});
        console.log(`Found ${staffList.length} staff:`);
        staffList.forEach(s => {
            console.log(`- Name: ${s.name}, Email: ${s.email}, Role: ${s.role}, Active: ${s.isActive}`);
        });

        console.log("\n--- CLIENT ACCOUNTS ---");
        const clients = await ClientAccount.find({});
        console.log(`Found ${clients.length} clients:`);
        clients.forEach(c => {
            console.log(`- Name: ${c.name}, Email: ${c.email}, Active: ${c.isActive}`);
        });

    } catch (err) {
        console.error("Error during check:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

checkUsers();
