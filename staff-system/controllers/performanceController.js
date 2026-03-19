const performanceService = require('../services/performanceService');
const StaffPerformanceProfile = require('../models/StaffPerformanceProfile');
const EventPerformanceBaseline = require('../models/EventPerformanceBaseline');
const AuditLog = require('../models/AuditLog');

exports.renderDashboard = async (req, res) => {
    try {
        res.render('admin/performanceDashboard', {
            _page: 'performance',
            user: req.user
        });
    } catch (err) {
        console.error('Error rendering performance dashboard:', err);
        res.status(500).send('Server Error');
    }
};

exports.getDashboardData = async (req, res) => {
    try {
        const topPerformers = await performanceService.getTopPerformers(10);
        const bestSupervisors = await performanceService.getBestSupervisors();
        const underperformers = await performanceService.getUnderperformers(3.0);
        
        const allProfiles = await StaffPerformanceProfile.find();
        
        let totalScore = 0;
        let countAbove4 = 0;
        let countBelow3 = 0;
        
        // Find most improved/declined
        let mostImproved = null;
        let mostDeclined = null;
        let maxUp = 0;
        let maxDown = 0;

        // Since we don't store exactly the "delta" in the schema right now, 
        // we could just fetch staff with trend = 'improving' and highest score diff 
        // For simplicity we will just pick top score_trend matches.
        
        const improving = [];
        const declining = [];
        
        // Distribution map for 1-5 (1-2, 2-3, 3-4, 4-5)
        const distribution = {
            '1-2': 0,
            '2-3': 0,
            '3-4': 0,
            '4-5': 0
        };

        let totalReviewsMonth = 0;
        
        allProfiles.forEach(p => {
            const score = p.average_overall_score;
            if (score > 0) {
                totalScore += score;
                if (score > 4.0) countAbove4++;
                if (score < 3.0) countBelow3++;
                
                if (score <= 2) distribution['1-2']++;
                else if (score <= 3) distribution['2-3']++;
                else if (score <= 4) distribution['3-4']++;
                else distribution['4-5']++;
            }
            
            if (p.score_trend === 'improving') improving.push(p);
            if (p.score_trend === 'declining') declining.push(p);
            
            // Very rough total reviews this month proxy based on total_reviews_received vs date
            // This is just a basic calculation proxy.
            totalReviewsMonth += (p.total_reviews_received); // In true implementation this would aggregate from PerformanceReviews in last 30 days
        });

        // Quick mock for most improved (top average score among improving)
        if (improving.length > 0) mostImproved = improving.sort((a,b)=>b.average_overall_score - a.average_overall_score)[0];
        if (declining.length > 0) mostDeclined = declining.sort((a,b)=>a.average_overall_score - b.average_overall_score)[0]; // Lowest declining

        const activeStaffCount = allProfiles.filter(p => p.average_overall_score > 0).length;

        // Populate minimal names for improved/declined if found. (Would normally use populate() but since doing in memory loop, doing manual query is okay, we'll just return raw profiles and front-end handles or we re-query)
        if (mostImproved) await mostImproved.populate('staff_id', 'firstname lastname');
        if (mostDeclined) await mostDeclined.populate('staff_id', 'firstname lastname');

        res.json({
            success: true,
            data: {
                platform_average: activeStaffCount > 0 ? (totalScore / activeStaffCount).toFixed(2) : 0,
                total_reviews_this_month: totalReviewsMonth, // Approximate
                pct_above_4: activeStaffCount > 0 ? ((countAbove4 / activeStaffCount) * 100).toFixed(1) : 0,
                pct_below_3: activeStaffCount > 0 ? ((countBelow3 / activeStaffCount) * 100).toFixed(1) : 0,
                most_improved: mostImproved,
                most_declined: mostDeclined,
                top_performers: topPerformers,
                underperformers: underperformers,
                best_supervisors: bestSupervisors,
                distribution: distribution
            },
            timestamp: new Date()
        });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).json({ success: false, error: err.message, timestamp: new Date() });
    }
};

exports.getStaffProfile = async (req, res) => {
    try {
        const data = await performanceService.getStaffProfile(req.params.id);
        res.json({ success: true, data, timestamp: new Date() });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "An error occurred processing your request",
                statusCode: 500,
                details: err.message
            },
            timestamp: new Date()
        });
    }
};

exports.getSupervisors = async (req, res) => {
    try {
        const top = await performanceService.getBestSupervisors(req.query.eventType);
        res.json({ success: true, data: top, timestamp: new Date() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, timestamp: new Date() });
    }
};

exports.flagStaff = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, error: 'Reason required', timestamp: new Date() });

        const profile = await performanceService.flagStaffDisciplinary(req.params.staffId, reason, req.user._id);
        res.json({ success: true, data: profile, timestamp: new Date() });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "An error occurred processing your request",
                statusCode: 500,
                details: err.message
            },
            timestamp: new Date()
        });
    }
};

exports.reopenReviewWindow = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { reason } = req.body;

        if (!reason) return res.status(400).json({ success: false, error: 'Reason required to reopen review window', timestamp: new Date() });

        const baseline = await EventPerformanceBaseline.findOne({ event_id: eventId });
        if (!baseline) return res.status(404).json({ success: false, error: 'Event baseline not found', timestamp: new Date() });

        // Extend by 24 hours
        let currentEnd = baseline.review_window_extended_until || new Date(baseline.snapshot_taken_at.getTime() + (48 * 60 * 60 * 1000));
        let newEnd = new Date(Math.max(currentEnd.getTime(), new Date().getTime()) + (24 * 60 * 60 * 1000));

        baseline.review_window_extended_until = newEnd;
        await baseline.save();

        await AuditLog.create({
            actionType: 'REVIEW_WINDOW_EXTENDED',
            targetModel: 'EventPerformanceBaseline',
            targetId: baseline._id,
            performedBy: req.user._id,
            details: { reason, extended_until: newEnd, event_id: eventId }
        });

        res.json({ success: true, data: { extended_until: newEnd }, timestamp: new Date() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, timestamp: new Date() });
    }
};
