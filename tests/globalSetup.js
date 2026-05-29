/**
 * tests/globalSetup.js
 *
 * Jest globalSetup — runs ONCE before any test suite.
 *
 * Responsibilities:
 * 1. Load .env.test and set NODE_ENV / VAPID fallbacks
 * 2. Start a SINGLE MongoMemoryServer instance shared by all suites
 * 3. Expose the URI via process.env.MONGO_TEST_URI
 * 4. Persist the instance reference to a temp file so globalTeardown
 *    (which runs in a separate worker) can stop it cleanly.
 *
 * This eliminates the "spawn UNKNOWN / fassert / 10 000 ms timeout"
 * crashes caused by 31 suites each starting their own instance.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Temp file used to pass connection details to globalTeardown
const CONFIG_PATH = path.join(os.tmpdir(), 'jest-mongo-config.json');

module.exports = async () => {
    // ── 1. Environment ──────────────────────────────────────────
    dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

    process.env.NODE_ENV = 'test';

    // Ensure VAPID values are always present for test bootstrapping.
    process.env.VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:test@example.com';
    process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BMockPublicKeyForTestsOnly0123456789abcdefghijklmnopqrstuvwxyzABCDE';
    process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'mockPrivateKeyForTestsOnly0123456789abcdefghijklmnopqrstuvwxyzABCDE';

    // ── 2. Start ONE MongoMemoryServer ──────────────────────────
    const mongod = await MongoMemoryServer.create({
        instance: {
            // Give the single instance a generous startup timeout
            launchTimeout: 30000,
        },
    });

    const mongoUri = mongod.getUri();

    // ── 3. Expose URI to all test suites ────────────────────────
    process.env.MONGO_TEST_URI = mongoUri;
    process.env.MONGO_URI = mongoUri;
    process.env.MONGODB_URI = mongoUri;

    // ── 4. Persist config for globalTeardown ────────────────────
    // globalTeardown runs in a separate context, so we write the
    // instance's internal connection details to a temp file.
    fs.writeFileSync(
        CONFIG_PATH,
        JSON.stringify({
            mongoUri,
            dbPath: mongod.instanceInfo?.dbPath,
            port: mongod.instanceInfo?.port,
        }),
    );

    // Also store on globalThis for same-process access (--runInBand)
    globalThis.__MONGOD__ = mongod;
};
