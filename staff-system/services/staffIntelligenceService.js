/**
 * staffIntelligenceService.js
 * Converts raw staff data into performance intelligence and rankings.
 */

const StaffPerformanceSummary = require('../models/StaffPerformanceSummary');
const StaffPerformanceProfile = require('../models/StaffPerformanceProfile');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');

/**
 * Calculate and upsert a single staff member's performance summary.
 */
async function calculatePerformance(staffId) {
    const profile = await StaffPerformanceProfile.findOne({ staff_id: staffId }).lean();

    // Count total events
    const totalEvents = await Assignment.countDocuments({
        $or: [
            { accepted_staff_ids: staffId },
            { assigned_staff_ids: staffId }
        ],
        status: 'Completed'
    });

    // Attendance stats
    const attendanceRecords = await Attendance.find({ staff_id: staffId }).lean();
    const totalAttendance = attendanceRecords.length;
    const clockedIn = attendanceRecords.filter(a => a.clock_in).length;
    const lateCount = attendanceRecords.filter(a => a.status === 'Late' || (a.minutes_late && a.minutes_late > 0)).length;
    const missedCount = attendanceRecords.filter(a => a.status === 'Missing' || a.status === 'No Show').length;
    const attendanceRate = totalAttendance > 0 ? Math.round((clockedIn / totalAttendance) * 100) : 100;

    // Rating
    const avgRating = profile ? (profile.average_overall_score || 3.0) : 3.0;

    // Reliability score (composite)
    let reliability = 50;
    reliability += Math.min((totalEvents / 5) * 10, 20); // Up to 20 for experience
    reliability += Math.min((avgRating - 2) * 10, 20);   // Up to 20 for rating
    reliability += Math.min((attendanceRate / 100) * 15, 15); // Up to 15 for attendance
    reliability -= Math.min(lateCount * 2, 10);           // Penalty for lateness
    reliability -= Math.min(missedCount * 5, 15);         // Penalty for missed events
    reliability = Math.max(0, Math.min(100, Math.round(reliability)));

    await StaffPerformanceSummary.findOneAndUpdate(
        { staff_id: staffId },
        {
            $set: {
                total_events: totalEvents,
                avg_rating: Math.round(avgRating * 10) / 10,
                reliability_score: reliability,
                attendance_rate: attendanceRate,
                missed_events: missedCount,
                late_count: lateCount,
                last_updated: new Date()
            }
        },
        { upsert: true, new: true }
    );

    return { staffId, totalEvents, avgRating, reliability, attendanceRate };
}

/**
 * After an event completes, update all participating staff summaries.
 */
async function updatePerformanceAfterEvent(eventId) {
    const assignment = await Assignment.findById(eventId)
        .select('accepted_staff_ids assigned_staff_ids').lean();
    if (!assignment) return;

    const staffIds = [
        ...(assignment.accepted_staff_ids || []),
        ...(assignment.assigned_staff_ids || [])
    ];

    const results = [];
    for (const sid of staffIds) {
        try {
            const r = await calculatePerformance(sid);
            results.push(r);
        } catch (err) {
            console.error(`[StaffIntelligence] Failed for staff ${sid}:`, err.message);
        }
    }
    return results;
}

/**
 * Get staff ranking (leaderboard).
 */
async function getStaffRanking(limit = 20) {
    return StaffPerformanceSummary.find()
        .sort({ reliability_score: -1, avg_rating: -1 })
        .limit(limit)
        .populate('staff_id', 'firstname lastname role phone')
        .lean();
}

module.exports = { calculatePerformance, updatePerformanceAfterEvent, getStaffRanking };
