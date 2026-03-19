require('dotenv').config();
const mongoose = require('mongoose');

// Define connection
const dbOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true
};

const URI = process.env.MONGO_URI || 'mongodb://localhost:27017/emerald_production';

async function verifyIndexes() {
    console.log('============= INDEX VERIFICATION START =============');
    console.log(`Connecting to: ${URI.split('@').pop()}`);
    
    try {
        await mongoose.connect(URI, dbOptions);
        console.log('✅ Connected to MongoDB\n');
        
        const db = mongoose.connection.db;
        const results = [];

        // Definition of indices required
        const requiredIndices = [
            { coll: 'staffs', index: { email: 1 }, options: { unique: true } },
            { coll: 'assignments', index: { staff_id: 1, 'lifecycle_state': 1 }, options: {} },
            { coll: 'attendances', index: { event_id: 1, staff_id: 1 }, options: {} },
            { coll: 'attendances', index: { location: '2dsphere' }, options: {} },
            { coll: 'ratelimitentries', index: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
            { coll: 'biometricsessions', index: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
            { coll: 'emergencyotps', index: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
            { coll: 'clientsessions', index: { expires_at: 1 }, options: { expireAfterSeconds: 0 } },
            { coll: 'staffmissingalerts', index: { event_id: 1, staff_id: 1 }, options: {} },
            { coll: 'eventpredictionsnapshots', index: { assignmentId: 1 }, options: {} }
        ];

        for (const req of requiredIndices) {
            const collection = db.collection(req.coll);
            const indexName = Object.keys(req.index).join('_') + '_' + Object.values(req.index).join('_');
            
            try {
                const existingIndexes = await collection.indexes().catch(() => []);
                const exists = existingIndexes.some(i => {
                    const keysMatch = JSON.stringify(i.key) === JSON.stringify(req.index);
                    return keysMatch;
                });

                if (exists) {
                    results.push({ Collection: req.coll, Index: JSON.stringify(req.index), Status: '✅ Verified' });
                } else {
                    console.log(`[!] Creating missing index on ${req.coll}:`, req.index);
                    await collection.createIndex(req.index, req.options);
                    results.push({ Collection: req.coll, Index: JSON.stringify(req.index), Status: '✅ Created' });
                }
            } catch (err) {
                results.push({ Collection: req.coll, Index: JSON.stringify(req.index), Status: `❌ Failed: ${err.message}` });
            }
        }

        console.table(results);
        console.log('\n============= INDEX VERIFICATION DONE ==============');
        
    } catch (err) {
        console.error('Fatal Index Script Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

verifyIndexes();
