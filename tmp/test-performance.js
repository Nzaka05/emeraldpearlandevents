'use strict';
/**
 * Test suite: Staff Rating & Performance Intelligence System
 * Run: node tmp/test-performance.js
 */

const path = require('path');
const root = path.join(__dirname, '..');
process.env.NODE_ENV = 'test';

// Use staff-system's OWN mongoose so all models share one connection
const mongoose = require(path.join(root, 'staff-system/node_modules/mongoose'));

const Assignment    = require(path.join(root, 'staff-system/models/Assignment'));
const Staff         = require(path.join(root, 'staff-system/models/Staff'));
const PerformanceReview         = require(path.join(root, 'staff-system/models/PerformanceReview'));
const StaffPerformanceProfile   = require(path.join(root, 'staff-system/models/StaffPerformanceProfile'));
const SupervisorRatingProfile   = require(path.join(root, 'staff-system/models/SupervisorRatingProfile'));
const EventPerformanceBaseline  = require(path.join(root, 'staff-system/models/EventPerformanceBaseline'));
const Attendance    = require(path.join(root, 'staff-system/models/Attendance'));
const AuditLog      = require(path.join(root, 'staff-system/models/AuditLog'));

const performanceService  = require(path.join(root, 'staff-system/services/performanceService'));
const { generatePrediction } = require(path.join(root, 'staff-system/services/eventPredictionService'));
const lifecycleService    = require(path.join(root, 'staff-system/services/eventLifecycleService'));

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URI ||
    'mongodb+srv://admin:Galaxyimpact.@cluster0.wa8samz.mongodb.net/emerald?retryWrites=true&w=majority';

let pass = 0, fail = 0;

// Unique per-run tag so old test data never conflicts
const RUN_TAG = `PERF_TEST_${Date.now()}`;

function check(label, condition, extra = '') {
    if (condition) { console.log(`  ✓  PASS | ${label}${extra ? ' — ' + extra : ''}`); pass++; }
    else           { console.log(`  ✗  FAIL | ${label}${extra ? ' — ' + extra : ''}`); fail++; }
}

// ─── Helpers ──────────────────────────────────────────────────────
let adminId; // filled after createStaff for sup

async function mkStaff(tag, role = 'Staff') {
    return Staff.create({
        name: `Test_${RUN_TAG}_${tag}`,
        email: `perftest_${RUN_TAG}_${tag}_${Date.now()}@perftest.local`,
        phone: '0700000000',
        role, status: 'Active', password: 'Xtest!1'
    });
}

function mkAssign(label, extra = {}) {
    return Assignment.create({
        title: `PERF_TEST ${RUN_TAG} ${label}`,
        description: 'N/A', location: 'Nairobi',
        date: new Date(), start_time: '08:00', end_time: '16:00',
        pay_rate: 1000, createdByAdmin: adminId,
        ...extra
    });
}

async function insertReviews(staffId, supId, baseAssignId, scores) {
    const baseMs = Date.now() - scores.length * 200_000;
    const docs = scores.map((score, i) => {
        // Must use a unique event_id for each review to avoid unique index [event_id, staff_id] violation
        const uniqueEventId = new mongoose.Types.ObjectId();
        return {
            event_id: uniqueEventId, assignment_id: uniqueEventId,
            staff_id: staffId, supervisor_id: supId,
            punctuality_rating: 3, professionalism_rating: 3,
            teamwork_rating: 3, client_interaction_rating: 3,
            task_completion_rating: 3,
            overall_score: score, would_rebook: true,
            comments: RUN_TAG,
            submitted_at: new Date(baseMs + i * 100_000)
        };
    });
    await PerformanceReview.collection.insertMany(docs);
}

async function cleanUp() {
    // First find all test staff IDs (by email domain), then purge their data
    const testStaff = await Staff.find({ email: /@perftest\.local/ }).select('_id');
    const testIds = testStaff.map(s => s._id);

    if (testIds.length > 0) {
        await PerformanceReview.deleteMany({ $or: [
            { staff_id: { $in: testIds } },
            { supervisor_id: { $in: testIds } },
            { comments: /^PERF_TEST/ }
        ]});
        await StaffPerformanceProfile.deleteMany({ staff_id: { $in: testIds } });
        await SupervisorRatingProfile.deleteMany({ staff_id: { $in: testIds } });
    } else {
        await PerformanceReview.deleteMany({ comments: /^PERF_TEST/ });
    }
    await Staff.deleteMany({ email: /@perftest\.local/ });
    await Assignment.deleteMany({ title: /^PERF_TEST/ });
    await Attendance.deleteMany({ date: '1999-01-01' });
    await EventPerformanceBaseline.deleteMany({ notes: /test|baseline/ });
}

// ─── Main ─────────────────────────────────────────────────────────
async function runTests() {
    console.log('\n======== PERFORMANCE MODULE TEST SUITE ========\n');

    await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 30000, socketTimeoutMS: 45000,
        connectTimeoutMS: 30000, maxPoolSize: 5
    });
    await new Promise((ok, fail) => {
        if (mongoose.connection.readyState === 1) return ok();
        mongoose.connection.once('connected', ok);
        mongoose.connection.once('error', fail);
        setTimeout(() => fail(new Error('DB timeout')), 30000);
    });
    console.log(`[DB] Connected — readyState: ${mongoose.connection.readyState}\n`);

    await cleanUp();

    // shared admin/supervisor
    const sup = await mkStaff('sup', 'Supervisor');
    adminId = sup._id;

    // shared base assignment (COMPLETED = can be used as event_id)
    const base = await mkAssign('Base', { status: 'Completed', lifecycle_state: 'COMPLETED' });

    // ─── 1. Score Trend ──────────────────────────────────────
    console.log('--- SECTION 1: Score Trend ---');
    const sImp = await mkStaff('imp');
    const sDec = await mkStaff('dec');
    const sSta = await mkStaff('sta');

    // improving: old(past)=[3.2,3.4,3.1]  new(recent)=[3.8,4.1,4.3]
    await insertReviews(sImp._id, sup._id, base._id, [3.2, 3.4, 3.1, 3.8, 4.1, 4.3]);
    await performanceService.updateStaffProfile(sImp._id);
    const pImp = await StaffPerformanceProfile.findOne({ staff_id: sImp._id });
    check('Improving trend (delta=0.84 > 0.3)', pImp?.score_trend === 'improving', `got "${pImp?.score_trend}"`);

    // declining: old=[4.5,4.3,4.4]  new=[3.8,3.5,3.2]
    await insertReviews(sDec._id, sup._id, base._id, [4.5, 4.3, 4.4, 3.8, 3.5, 3.2]);
    await performanceService.updateStaffProfile(sDec._id);
    const pDec = await StaffPerformanceProfile.findOne({ staff_id: sDec._id });
    check('Declining trend (delta=-0.97 < -0.3)', pDec?.score_trend === 'declining', `got "${pDec?.score_trend}"`);

    // stable: old=[3.8,4.0,3.9]  new=[4.1,3.8,4.0]  delta≈0.07
    await insertReviews(sSta._id, sup._id, base._id, [3.8, 4.0, 3.9, 4.1, 3.8, 4.0]);
    await performanceService.updateStaffProfile(sSta._id);
    const pSta = await StaffPerformanceProfile.findOne({ staff_id: sSta._id });
    check('Stable trend (delta≈0.07 ≤ 0.3)', pSta?.score_trend === 'stable', `got "${pSta?.score_trend}"`);

    // ─── 2. Team Compatibility ────────────────────────────────
    console.log('\n--- SECTION 2: Team Compatibility ---');
    const [sA, sB, sC, sD] = await Promise.all([
        mkStaff('A'), mkStaff('B'), mkStaff('C'), mkStaff('D')
    ]);

    // A & B high (avg 4.6)
    for (let k = 0; k < 3; k++) {
        const ev = await mkAssign(`Hi${k}`);
        await PerformanceReview.insertMany([
            { event_id: ev._id, assignment_id: ev._id, staff_id: sA._id, supervisor_id: sup._id, punctuality_rating:5, professionalism_rating:5, teamwork_rating:5, client_interaction_rating:4, task_completion_rating:4, overall_score:4.6, would_rebook:true, comments:'PERF_TEST' },
            { event_id: ev._id, assignment_id: ev._id, staff_id: sB._id, supervisor_id: sup._id, punctuality_rating:5, professionalism_rating:5, teamwork_rating:5, client_interaction_rating:4, task_completion_rating:4, overall_score:4.6, would_rebook:true, comments:'PERF_TEST' }
        ]);
    }
    // C & D low (avg 2.15)
    for (let k = 0; k < 2; k++) {
        const ev = await mkAssign(`Lo${k}`);
        await PerformanceReview.insertMany([
            { event_id: ev._id, assignment_id: ev._id, staff_id: sC._id, supervisor_id: sup._id, punctuality_rating:2, professionalism_rating:2, teamwork_rating:2, client_interaction_rating:3, task_completion_rating:2, overall_score:2.15, would_rebook:false, comments:'PERF_TEST' },
            { event_id: ev._id, assignment_id: ev._id, staff_id: sD._id, supervisor_id: sup._id, punctuality_rating:2, professionalism_rating:2, teamwork_rating:3, client_interaction_rating:2, task_completion_rating:2, overall_score:2.15, would_rebook:false, comments:'PERF_TEST' }
        ]);
    }

    const cAB = await performanceService.getTeamCompatibility([sA._id, sB._id]);
    check('High pair — compatibility > 0.8', cAB > 0.8, `got ${cAB}`);

    const cAC = await performanceService.getTeamCompatibility([sA._id, sC._id]);
    check('Unknown pair — compatibility = 0.5', cAC === 0.5, `got ${cAC}`);

    const cCD = await performanceService.getTeamCompatibility([sC._id, sD._id]);
    check('Low pair — compatibility < 0.5', cCD < 0.5, `got ${cCD}`);

    // ─── 3. Attendance Rate ───────────────────────────────────
    console.log('\n--- SECTION 3: Attendance Rate ---');
    const sNew = await mkStaff('newbie');
    await performanceService.updateStaffProfile(sNew._id);
    const pNew = await StaffPerformanceProfile.findOne({ staff_id: sNew._id });
    check('Zero assignments → attendance_rate null', pNew === null || pNew.attendance_rate === null, `got ${pNew?.attendance_rate}`);

    const sAtt = await mkStaff('att');
    for (let i = 0; i < 2; i++) {
        const a = await mkAssign(`Attended${i}`, {
            lifecycle_state: 'COMPLETED',
            accepted_staff_ids: [sAtt._id]
        });
        await Attendance.create({
            staff_id: sAtt._id,
            assignment_id: a._id,
            date: '1999-01-01',
            clock_in: new Date(),
            clock_out: new Date()
        });
    }
    await performanceService.updateStaffProfile(sAtt._id);
    const pAtt = await StaffPerformanceProfile.findOne({ staff_id: sAtt._id });
    check('2 attended COMPLETED → attendance_rate = 100', pAtt?.attendance_rate === 100, `got ${pAtt?.attendance_rate}`);

    // ─── 4. Weighted Score Calc ───────────────────────────────
    console.log('\n--- SECTION 4: Weighted Score Calculation ---');
    const sScore = await mkStaff('scorer');
    const rev = new PerformanceReview({
        event_id: base._id, assignment_id: base._id,
        staff_id: sScore._id, supervisor_id: sup._id,
        punctuality_rating: 4, professionalism_rating: 5,
        teamwork_rating: 3, client_interaction_rating: 4,
        task_completion_rating: 2,
        would_rebook: true, comments: 'PERF_TEST'
    });
    await rev.save();
    // 4×0.20 + 5×0.25 + 3×0.20 + 4×0.20 + 2×0.15 = 0.8+1.25+0.6+0.8+0.3 = 3.75
    check('Weighted overall_score = 3.75', rev.overall_score === 3.75, `got ${rev.overall_score}`);

    // ─── 5. Duplicate Block ───────────────────────────────────
    console.log('\n--- SECTION 5: Duplicate Review Block ---');
    await EventPerformanceBaseline.create({
        event_id: base._id, snapshot_taken_at: new Date(),
        assigned_staff_ids: [sScore._id], notes: 'test baseline'
    });
    let blocked = false;
    try {
        await performanceService.submitReview({
            event_id: base._id, assignment_id: base._id,
            staff_id: sScore._id, supervisor_id: sup._id,
            punctuality_rating: 3, professionalism_rating: 3, teamwork_rating: 3,
            client_interaction_rating: 3, task_completion_rating: 3,
            would_rebook: true, comments: 'PERF_TEST'
        });
    } catch(e) { blocked = e.message.toLowerCase().includes('duplicate'); }
    check('Duplicate review rejected', blocked);

    // ─── 6. Rating Validation ─────────────────────────────────
    console.log('\n--- SECTION 6: Rating Validation ---');
    // Rating 6 should throw "Invalid rating" error from performanceService validation
    let rejectedOverRange = false;
    try {
        // create a unique event_id so it won't be caught by duplicate check
        const freshBase = await mkAssign('RatingTest', { status: 'Completed', lifecycle_state: 'COMPLETED' });
        const freshStaff = await mkStaff('ratingval');
        await EventPerformanceBaseline.create({
            event_id: freshBase._id, snapshot_taken_at: new Date(),
            assigned_staff_ids: [freshStaff._id], notes: 'test baseline'
        });
        await performanceService.submitReview({
            event_id: freshBase._id, assignment_id: freshBase._id,
            staff_id: freshStaff._id, supervisor_id: sup._id,
            punctuality_rating: 6, professionalism_rating: 3, teamwork_rating: 3,
            client_interaction_rating: 3, task_completion_rating: 3,
            would_rebook: true, comments: 'PERF_TEST'
        });
    } catch(e) { rejectedOverRange = e.message.includes('Must be 1-5') || e.message.includes('Invalid rating'); }
    check('Rating > 5 rejected', rejectedOverRange);

    // ─── 7. AI Risk + Disciplinary Flags ─────────────────────
    console.log('\n--- SECTION 7: AI Risk & Disciplinary Flags ---');
    const sFlagged = await mkStaff('flagged');
    await StaffPerformanceProfile.create({
        staff_id: sFlagged._id,
        average_overall_score: 4.2,
        disciplinary_flags: [{ reason: 'f1' }, { reason: 'f2' }, { reason: 'f3' }]
    });
    const riskAssign = await mkAssign('AiRisk', { accepted_staff_ids: [sFlagged._id] });
    let pred;
    try {
        pred = await generatePrediction(riskAssign._id);
    } catch(e) {
        check('AI prediction does not throw', false, e.message);
    }
    if (pred) {
        check('AI prediction returns riskLevel', pred.riskLevel !== undefined);
        check('3+ flags → MEDIUM minimum risk', ['MEDIUM','HIGH'].includes(pred.riskLevel), `got ${pred.riskLevel}`);
        check('recommendedSupervisor in output', 'recommendedSupervisor' in pred);
        check('recommendedTeam in output', 'recommendedTeam' in pred);
        check('Disciplinary notice in recommendations', pred.recommendations.some(r => r.toLowerCase().includes('disciplinary')));
    }

    // ─── 8. EventPerformanceBaseline on COMPLETED ────────────────
    console.log('\n--- SECTION 8: Baseline Snapshot on COMPLETED ---');
    const sLive = await mkStaff('livestaff');
    const liveAssign = await mkAssign('LiveClose', {
        lifecycle_state: 'LIVE', status: 'Active',
        accepted_staff_ids: [sLive._id]
    });
    await lifecycleService.transition(liveAssign._id, 'COMPLETED', sup._id, { force: true });
    const bl = await EventPerformanceBaseline.findOne({ event_id: liveAssign._id });
    check('EventPerformanceBaseline created on COMPLETED', bl != null);
    check('Baseline captures staff IDs', bl?.assigned_staff_ids?.length === 1, `got ${bl?.assigned_staff_ids?.length}`);

    // ─── Results ──────────────────────────────────────────────
    console.log(`\n======== RESULTS: ${pass} passed, ${fail} failed ========\n`);

    await cleanUp();
    await mongoose.disconnect();
    process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('\nFATAL:', err.message || err);
    mongoose.disconnect().catch(() => {});
    process.exit(1);
});
