const dotenvFlow = require('dotenv-flow');
const mongoose = require('mongoose');

dotenvFlow.config({ node_env: 'test', purge_dotenv: true });

let staffSystemMongoose = null;

try {
    // Some modules under staff-system resolve their own mongoose instance.
    // Connect it to the same in-memory database for consistent tests.
    staffSystemMongoose = require('../staff-system/node_modules/mongoose');
} catch (error) {
    staffSystemMongoose = null;
}

beforeAll(async () => {
    // Use the shared MongoMemoryServer URI set by globalSetup.js
    // This eliminates per-suite mongod spawning that caused Windows
    // "spawn UNKNOWN" / "fassert" / "timeout" crashes.
    const mongoUri = process.env.MONGO_TEST_URI;

    if (!mongoUri) {
        throw new Error(
            'MONGO_TEST_URI not set. Ensure jest.config.js points ' +
            'globalSetup to tests/globalSetup.js',
        );
    }

    process.env.MONGO_URI = mongoUri;
    process.env.MONGODB_URI = mongoUri;

    await mongoose.connect(mongoUri);

    if (staffSystemMongoose && staffSystemMongoose !== mongoose && !staffSystemMongoose.connection.readyState) {
        await staffSystemMongoose.connect(mongoUri);
    }
});

beforeEach(async () => {
    const collections = mongoose.connection.collections;

    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }

    if (staffSystemMongoose && staffSystemMongoose !== mongoose && staffSystemMongoose.connection.readyState) {
        const staffCollections = staffSystemMongoose.connection.collections;
        for (const key of Object.keys(staffCollections)) {
            await staffCollections[key].deleteMany({});
        }
    }
});

afterAll(async () => {
    await mongoose.disconnect();

    if (staffSystemMongoose && staffSystemMongoose !== mongoose && staffSystemMongoose.connection.readyState) {
        await staffSystemMongoose.disconnect();
    }

    // NOTE: MongoMemoryServer is NOT stopped here.
    // The single shared instance is stopped by globalTeardown.js
});
