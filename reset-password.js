const mongoose = require('mongoose');
const Admin = require('./server/models/Admin');

async function resetPassword() {
    const uri = 'mongodb+srv://admin:Galaxyimpact.@cluster0.wa8samz.mongodb.net/?appName=Cluster0';
    console.log("Connecting to MongoDB...");
    try {
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("Connected successfully!");

        // Update password for emeraldpearlandevents@gmail.com
        let admin = await Admin.findOne({ email: 'emeraldpearlandevents@gmail.com' });
        if (admin) {
            admin.passwordHash = 'TestAdmin123!';
            admin.name = 'EMERALD ADMIN';
            admin.role = 'admin';
            admin.isActive = true;
            admin.markModified('passwordHash');
            await admin.save();
            console.log("✅ Updated password for emeraldpearlandevents@gmail.com to: TestAdmin123!");
        } else {
            admin = new Admin({
                email: 'emeraldpearlandevents@gmail.com',
                passwordHash: 'TestAdmin123!',
                name: 'EMERALD ADMIN',
                role: 'admin',
                isActive: true
            });
            await admin.save();
            console.log("✅ Created new admin emeraldpearlandevents@gmail.com with password: TestAdmin123!");
        }

        // Also update admin@emeraldpearl.com
        let admin2 = await Admin.findOne({ email: 'admin@emeraldpearl.com' });
        if (admin2) {
            admin2.passwordHash = 'TestAdmin123!';
            admin2.isActive = true;
            admin2.markModified('passwordHash');
            await admin2.save();
            console.log("✅ Updated password for admin@emeraldpearl.com to: TestAdmin123!");
        }

    } catch (err) {
        console.error("Error during password reset:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

resetPassword();
