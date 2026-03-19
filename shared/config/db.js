require('dotenv').config();
const mongoose = require('mongoose');

/**
 * Connect to MongoDB. Skips if already connected.
 * Uses MONGO_URI from environment.
 */
async function connect() {
    if (mongoose.connection.readyState === 1) {
        return; // Already connected
    }

    const uri = process.env.MONGO_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('❌ MONGO_URI or MONGO_URI not defined in .env');
        throw new Error('MongoDB URI not configured');
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });
        console.log('✅ MongoDB connected');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        throw err;
    }
}

module.exports = { connect };
