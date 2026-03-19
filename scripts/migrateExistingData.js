require('dotenv').config();
const mongoose = require('mongoose');

// Connect Mongoose to the URI
const URI = process.env.MONGO_URI || 'mongodb://localhost:27017/emerald_production';

async function runSafeMigrations() {
    console.log('============ MIGRATION SCRIPT START ============');
    try {
        await mongoose.connect(URI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('✅ Connected to MongoDB\n');
        
        const db = mongoose.connection.db;
        
        // ─────────────────────────────────────────────────────────────────
        // STEP 1: StaffPerformanceProfile
        // Check if StaffPerformanceProfile exists for every Staff. 
        // If not, create a default profile with null values.
        console.log('--- Step 1: Auditing StaffPerformanceProfiles ---');
        const staffColl = db.collection('staffs');
        const profileColl = db.collection('staffperformanceprofiles');
        
        const allStaff = await staffColl.find({}).toArray();
        let profilesCreated = 0;
        
        for (const staff of allStaff) {
            const existing = await profileColl.findOne({ staff_id: staff._id });
            if (!existing) {
                await profileColl.insertOne({
                    staff_id: staff._id,
                    overall_rating: 0,
                    punctuality_avg: 0,
                    professionalism_avg: 0,
                    teamwork_avg: 0,
                    client_interaction_avg: 0,
                    task_completion_avg: 0,
                    events_worked: 0,
                    on_time_percentage: 0,
                    total_reviews: 0,
                    strengths: [],
                    improvement_areas: [],
                    would_rebook_percentage: 100,
                    notes: "Auto-migrated placeholder profile",
                    last_updated: new Date()
                });
                profilesCreated++;
            }
        }
        console.log(`✅ Profiles synced. Created ${profilesCreated} missing profiles.`);


        // ─────────────────────────────────────────────────────────────────
        // STEP 2: EventLedger for COMPLETED assignments
        // Check if EventLedger exists for every Assignment in COMPLETED or FINANCE_SETTLED.
        console.log('\n--- Step 2: Auditing EventLedgers ---');
        const assignmentColl = db.collection('assignments');
        const ledgerColl = db.collection('eventledgers');
        
        // Fix 1: Generate unique ledgerIds for existing documents that have null
        const ledgersWithNullId = await ledgerColl.find({ ledgerId: null }).toArray();
        for (const ledger of ledgersWithNullId) {
            await ledgerColl.updateOne(
                { _id: ledger._id },
                { $set: { ledgerId: `LEGACY-${ledger._id.toString()}` } }
            );
        }
        console.log(`Fixed ${ledgersWithNullId.length} EventLedger documents with null ledgerId`);
        
        const pastAssignments = await assignmentColl.find({ 
            status: { $in: ['Completed', 'FINANCE_SETTLED'] } 
        }).toArray();
        
        let ledgersCreated = 0;
        for (const assignment of pastAssignments) {
            const existingLedger = await ledgerColl.findOne({ event_id: assignment._id });
            if (!existingLedger) {
                try {
                    await ledgerColl.insertOne({
                        ledgerId: `LED-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
                        event_id: assignment._id,
                        total_gross: 0,
                        total_staff_costs: 0,
                        total_agency_fees: 0,
                        total_emergency_payouts: 0,
                        net_profit: 0,
                        margin_percentage: 0,
                        finalized: assignment.status === 'FINANCE_SETTLED',
                        finalized_at: assignment.status === 'FINANCE_SETTLED' ? new Date() : null,
                        finalized_by: null,
                        notes: "Auto-migrated placeholder ledger",
                        last_updated: new Date(),
                        created_at: new Date()
                    });
                    ledgersCreated++;
                } catch (err) {
                    if (err.code === 11000) {
                        // Skip harmlessly - likely race condition or already exists via another field index.
                        // We safely ignore duplicates to preserve idempotency.
                    } else {
                        throw err;
                    }
                }
            }
        }
        console.log(`✅ Ledgers synced. Created ${ledgersCreated} missing ledgers.`);


        // ─────────────────────────────────────────────────────────────────
        // STEP 3: Attendance fields validation
        // Added biometric fields (device_id, clockin_photo, proximity_result)
        console.log('\n--- Step 3: Auditing Attendance schema fields ---');
        const attendanceColl = db.collection('attendances');
        
        const attUpdateResult = await attendanceColl.updateMany(
            { 
                $or: [
                    { device_id: { $exists: false } },
                    { clockin_photo: { $exists: false } },
                    { proximity_result: { $exists: false } }
                ]
            },
            {
                $set: {
                    device_id: null,
                    clockin_photo: null,
                    proximity_result: null
                }
            }
        );
        console.log(`✅ Attendance synced. Modified ${attUpdateResult.modifiedCount} legacy records.`);


        // ─────────────────────────────────────────────────────────────────
        // STEP 4: Assignment lifecycle_state normalization
        // Set any Assignment without lifecycle_state to COMPLETED if it has a completion date or PLANNED if not.
        console.log('\n--- Step 4: Auditing Assignment lifecycle_state ---');
        
        // Find those without a lifecycle state
        const assignmentsWithoutLifecycle = await assignmentColl.find({ 
            lifecycle_state: { $exists: false } 
        }).toArray();
        
        let assignmentsFixed = 0;
        for (const asm of assignmentsWithoutLifecycle) {
            let newState = 'PLANNED';
            if (asm.status === 'Completed' || asm.status === 'FINANCE_SETTLED' || asm.event_date < new Date()) {
                newState = 'COMPLETED';
            }
            
            await assignmentColl.updateOne(
                { _id: asm._id },
                { $set: { lifecycle_state: newState } }
            );
            assignmentsFixed++;
        }
        console.log(`✅ Assignments synced. Applied lifecycle_state to ${assignmentsFixed} legacy records.`);

        console.log('\n============= MIGRATION SCRIPT DONE ============');
    } catch (err) {
        console.error('Fatal Migration Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runSafeMigrations();
