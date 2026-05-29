/**
 * tests/setup.js
 *
 * Global test setup — runs before all test suites.
 * Connects to a test MongoDB instance and loads env vars.
 */

require('dotenv').config({ path: '.env.test' });

const mongoose = require('mongoose');

// ── VAPID placeholder guard ───────────────────────────────────────────────────
// web-push validates VAPID keys at require-time in some services.
// In test mode we inject a valid-format placeholder so the app boots
// without a real push key configured.
// These are FAKE keys — they will never send a real push notification.
const FAKE_VAPID_PUBLIC  = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const FAKE_VAPID_PRIVATE = 'UUxI4O8-FbRouAevSmBQ6co62groezfL_ZkFlylHfOQ';

if (!process.env.VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY === 'placeholder') {
    process.env.VAPID_PUBLIC_KEY  = FAKE_VAPID_PUBLIC;
    process.env.VAPID_PRIVATE_KEY = FAKE_VAPID_PRIVATE;
}

// ── Suppress noisy console output during tests ────────────────────────────────
// Comment these out if you need to debug a specific test
global.console.log  = jest.fn();
global.console.warn = jest.fn();
// Keep console.error visible so failures are readable

// ── Timeout ───────────────────────────────────────────────────────────────────
jest.setTimeout(30000);

// ── MongoDB connection ────────────────────────────────────────────────────────
beforeAll(async () => {
    const testMongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;

    if (!testMongoUri) {
        throw new Error('No MONGO_URI or MONGO_URI_TEST defined in .env.test');
    }

    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(testMongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
    }
});

afterAll(async () => {
    await mongoose.connection.close();
});
