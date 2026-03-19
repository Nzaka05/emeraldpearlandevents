const mongoose = require('mongoose');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const Staff = require('./models/Staff');

async function getAuthToken() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const user = await Staff.findOne({ email: 'teststaff@emerald.com' });
        
        if (!user) {
            console.error('Test staff user not found!');
            process.exit(1);
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'fallback_secret_key', {
            expiresIn: process.env.JWT_EXPIRE || '30d'
        });

        console.log('JWT_TOKEN=' + token);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

getAuthToken();
