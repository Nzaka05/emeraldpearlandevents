const mongoose = require('mongoose');
const PerformanceReview = require('../models/PerformanceReview');
const StaffPerformanceProfile = require('../models/StaffPerformanceProfile');
const SupervisorRatingProfile = require('../models/SupervisorRatingProfile');
const EventPerformanceBaseline = require('../models/EventPerformanceBaseline');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');

function emitToAdmin(event, payload) {
    if (global.io) {
        global.io.to('Admin').emit(event, payload);
    }
}

async function checkReviewWindow(eventId) {
    const baseline = await EventPerformanceBaseline.findOne({ event_id: eventId });
    if (!baseline) return { isOpen: false, reason: "Event has not completed or no performance baseline captured" };

    const now = new Date();
    let expirationTime = new Date(baseline.snapshot_taken_at.getTime() + (48 * 60 * 60 * 1000));
    
    if (baseline.review_window_extended_until) {
        expirationTime = new Date(Math.max(expirationTime.getTime(), baseline.review_window_extended_until.getTime()));
    }

    if (now > expirationTime) {
        return { isOpen: false, reason: "Review window has closed" };
    }
    return { isOpen: true, expirationTime };
}

async function submitReview(reviewData) {
    const windowCheck = await checkReviewWindow(reviewData.event_id);
    if (!windowCheck.isOpen) {
        throw new Error(windowCheck.reason);
    }

    ['punctuality_rating', 'professionalism_rating', 'teamwork_rating', 'client_interaction_rating', 'task_completion_rating'].forEach(field => {
        if (reviewData[field] < 1 || reviewData[field] > 5) {
            throw new Error(`Invalid rating for ${field}. Must be 1-5.`);
        }
    });

    const existing = await PerformanceReview.findOne({ event_id: reviewData.event_id, staff_id: reviewData.staff_id });
    if (existing) throw new Error("Duplicate review: Staff member already reviewed for this event.");

    const review = new PerformanceReview(reviewData);
    await review.save(); // overall_score calculated here automatically by schema

    await updateStaffProfile(review.staff_id);
    if (review.supervisor_id) {
        await updateSupervisorProfile(review.supervisor_id);
    }
    
    emitToAdmin('cmd:review_submitted', { staff_id: review.staff_id, event_id: review.event_id, score: review.overall_score });

    return review;
}

async function updateStaffProfile(staffId) {
    const reviews = await PerformanceReview.find({ staff_id: staffId }).sort({ submitted_at: -1 });
    
    let sumOverall = 0, sumPunct = 0, sumProf = 0, sumTeam = 0, sumClient = 0, sumTask = 0, rebookCount = 0;
    const count = reviews.length;
    
    let highest = 0;
    let lowest = 0;
    
    if (count > 0) {
        highest = reviews[0].overall_score;
        lowest = reviews[0].overall_score;
        
        reviews.forEach(r => {
            sumOverall += r.overall_score;
            sumPunct += r.punctuality_rating;
            sumProf += r.professionalism_rating;
            sumTeam += r.teamwork_rating;
            sumClient += r.client_interaction_rating;
            sumTask += r.task_completion_rating;
            if (r.would_rebook) rebookCount++;
            
            if (r.overall_score > highest) highest = r.overall_score;
            if (r.overall_score < lowest) lowest = r.overall_score;
        });
    }

    let score_trend = 'stable';
    // newest first (0 is newest)
    if (count >= 6) {
        const last3 = reviews.slice(0, 3);
        const prev3 = reviews.slice(3, 6);
        
        const last3Avg = last3.reduce((sum, r) => sum + r.overall_score, 0) / 3;
        const prev3Avg = prev3.reduce((sum, r) => sum + r.overall_score, 0) / 3;
        const delta = last3Avg - prev3Avg;
        
        // Use an epsilon to avoid floating point precision issues in exactly equal boundaries
        if (delta > 0.3000001) {
            score_trend = 'improving';
        } else if (delta < -0.3000001) {
            score_trend = 'declining';
        }
    }

    // attendance_rate = (fully attended) / (completed/settled assignments) * 100
    // Only count Assignment records where lifecycle_state is COMPLETED or FINANCE_SETTLED
    const relevantAssignments = await Assignment.find({
        accepted_staff_ids: staffId,
        lifecycle_state: { $in: ['COMPLETED', 'FINANCE_SETTLED'] }
    }).select('_id');

    let attendance_rate = null;
    if (relevantAssignments.length > 0) {
        const assignmentIds = relevantAssignments.map(a => a._id);
        const attendedRecords = await Attendance.find({
            staff_id: staffId,
            assignment_id: { $in: assignmentIds },
            clock_in: { $exists: true, $ne: null },
            clock_out: { $exists: true, $ne: null }
        });
        attendance_rate = (attendedRecords.length / relevantAssignments.length) * 100;
        attendance_rate = Math.round(attendance_rate * 100) / 100;
    }

    const payload = count === 0 ? {
            total_events_completed: 0,
            total_reviews_received: 0,
            average_overall_score: 0,
            average_punctuality: 0,
            average_professionalism: 0,
            average_teamwork: 0,
            average_client_interaction: 0,
            average_task_completion: 0,
            would_rebook_percentage: 0,
            highest_score_ever: 0,
            lowest_score_ever: 0,
            score_trend: 'stable',
            attendance_rate: attendance_rate,
            last_updated: new Date()
        } : {
            total_events_completed: count,
            total_reviews_received: count,
            average_overall_score: sumOverall / count,
            average_punctuality: sumPunct / count,
            average_professionalism: sumProf / count,
            average_teamwork: sumTeam / count,
            average_client_interaction: sumClient / count,
            average_task_completion: sumTask / count,
            would_rebook_percentage: (rebookCount / count) * 100,
            highest_score_ever: highest,
            lowest_score_ever: lowest,
            score_trend: score_trend,
            attendance_rate: attendance_rate,
            last_review_date: new Date(),
            last_updated: new Date()
    };

    await StaffPerformanceProfile.findOneAndUpdate(
        { staff_id: staffId },
        { $set: payload },
        { upsert: true, new: true }
    );
}

async function updateSupervisorProfile(supervisorId) {
    const supervisedReviews = await PerformanceReview.find({ supervisor_id: supervisorId });
    if (!supervisedReviews || supervisedReviews.length === 0) return;

    let totalScore = 0;
    supervisedReviews.forEach(r => totalScore += r.overall_score);
    const avgTeamScore = totalScore / supervisedReviews.length;

    const uniqueEvents = new Set(supervisedReviews.map(r => r.event_id.toString()));
    const rating = Math.min(5, Math.max(1, avgTeamScore)); // Baseline rating matches team score

    await SupervisorRatingProfile.findOneAndUpdate(
        { staff_id: supervisorId },
        {
            $set: {
                total_events_supervised: uniqueEvents.size,
                average_team_score: avgTeamScore,
                supervisor_rating: rating,
                last_updated: new Date()
            }
        },
        { upsert: true, new: true }
    );
}

async function getTopPerformers(limit = 10) {
    return StaffPerformanceProfile.find()
        .populate('staff_id', 'firstname lastname photo_url role')
        .sort({ average_overall_score: -1 })
        .limit(limit);
}

async function getUnderperformers(threshold = 3.0) {
    const profiles = await StaffPerformanceProfile.find({ average_overall_score: { $lt: threshold, $gt: 0 } })
        .populate('staff_id', 'firstname lastname role');
    
    return Promise.all(profiles.map(async p => {
        const latest = await PerformanceReview.findOne({ staff_id: p.staff_id }).sort({ submitted_at: -1 });
        return {
            ...p.toObject(),
            latest_improvement_areas: latest ? latest.improvement_areas : []
        };
    }));
}

async function getStaffProfile(staffId) {
    const profile = await StaffPerformanceProfile.findOne({ staff_id: staffId }).populate('staff_id');
    const recent = await PerformanceReview.find({ staff_id: staffId })
        .sort({ submitted_at: -1 }).limit(5).populate('event_id', 'title');
    return { profile, recent_reviews: recent };
}

async function getBestSupervisors(eventType) {
    return SupervisorRatingProfile.find()
        .populate('staff_id', 'firstname lastname')
        .sort({ supervisor_rating: -1 })
        .limit(5);
}

async function getTeamCompatibility(staffIdArray) {
    if (!staffIdArray || staffIdArray.length < 2) return 0.5;
    
    // Convert to strings for easier matching
    const staffIds = staffIdArray.map(id => id.toString());
    
    const s1Reviews = await PerformanceReview.find({ staff_id: staffIds[0] });
    const s1EventIds = s1Reviews.map(r => r.event_id.toString());
    
    let mutualEventIds = s1EventIds;
    for (let i = 1; i < staffIds.length; i++) {
        const revs = await PerformanceReview.find({ staff_id: staffIds[i] });
        const eIds = revs.map(r => r.event_id.toString());
        mutualEventIds = mutualEventIds.filter(id => eIds.includes(id));
    }
    
    if (mutualEventIds.length === 0) return 0.5; 
    
    let totalScore = 0;
    let count = 0;
    
    for (let eid of mutualEventIds) {
        const revs = await PerformanceReview.find({ event_id: eid, staff_id: { $in: staffIds } });
        revs.forEach(r => { totalScore += r.overall_score; count++; });
    }
    
    const avg = count > 0 ? (totalScore / count) : 0;
    // Map avg (1-5) to compatibility (0.0 - 1.0)
    const rawVal = (avg - 1) / 4;
    return Math.max(0, Math.min(1, Math.round(rawVal * 1000) / 1000));
}

async function flagStaffDisciplinary(staffId, reason, flaggedBy) {
    const profile = await StaffPerformanceProfile.findOneAndUpdate(
        { staff_id: staffId },
        {
            $push: { disciplinary_flags: { reason, flagged_by: flaggedBy, date: new Date() } }
        },
        { upsert: true, new: true }
    );
    emitToAdmin('cmd:disciplinary_flag', { staff_id: staffId, reason });
    return profile;
}

module.exports = {
    submitReview,
    updateStaffProfile,
    updateSupervisorProfile,
    getTopPerformers,
    getUnderperformers,
    getStaffProfile,
    getBestSupervisors,
    getTeamCompatibility,
    flagStaffDisciplinary,
    checkReviewWindow
};
