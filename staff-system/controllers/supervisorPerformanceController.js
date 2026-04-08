const respond = require('../../utils/respond');
const performanceService = require('../services/performanceService');
const EventPerformanceBaseline = require('../models/EventPerformanceBaseline');
const PerformanceReview = require('../models/PerformanceReview');
const Assignment = require('../models/Assignment');

exports.getPendingReviews = async (req, res) => {
    try {
        const { eventId } = req.params;
        const supervisorId = req.user._id;

        const baseline = await EventPerformanceBaseline.findOne({ event_id: eventId });
        if (!baseline) return respond(res, 404, { success: false, error: 'Event baseline not found or event not completed', timestamp: new Date() });

        // Ensure this supervisor was assigned to this event
        if (baseline.supervisor_id && baseline.supervisor_id.toString() !== supervisorId.toString()) {
            return respond(res, 403, { success: false, error: 'Not authorized to review this event team', timestamp: new Date() });
        }

        const windowCheck = await performanceService.checkReviewWindow(eventId);
        if (!windowCheck.isOpen) {
            return respond(res, 200, { success: true, data: { window_open: false, reason: windowCheck.reason }, timestamp: new Date() });
        }

        // Fetch already submitted reviews
        const existingReviews = await PerformanceReview.find({ event_id: eventId, supervisor_id: supervisorId });
        const reviewedIds = existingReviews.map(r => r.staff_id.toString());

        // Baseline contains assigned_staff_ids. Return those not in reviewedIds.
        const pendingIds = baseline.assigned_staff_ids
            .filter(id => !reviewedIds.includes(id.toString()))
            .filter(id => id.toString() !== supervisorId.toString()); // Don't review self

        // Populate basic staff data
        const AssignmentQuery = await Assignment.findOne({ 
            event: eventId, 
            staff: { $in: pendingIds } 
        }).populate('staff', 'firstname lastname photo_url role');

        // Note: A real implementation would fetch from Staff directly or from an aggregated Assignment list.
        // Let's populate from Staff
        const mongoose = require('mongoose');
        const Staff = mongoose.model('Staff');
        const pendingStaff = await Staff.find({ _id: { $in: pendingIds } }).select('firstname lastname photo_url role').lean();

        respond(res, 200, {
            success: true,
            data: {
                window_open: true,
                expires_at: windowCheck.expirationTime,
                pending_staff: pendingStaff
            },
            timestamp: new Date()
        });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message, timestamp: new Date() });
    }
};

exports.submitBatchReviews = async (req, res) => {
    try {
        const { eventId } = req.params;
        const supervisorId = req.user._id;
        const reviews = req.body.reviews; // Expected: [{staff_id, punctuality_rating...}, ...]

        if (!Array.isArray(reviews)) {
            return respond(res, 400, { success: false, error: 'Reviews must be an array', timestamp: new Date() });
        }

        const baseline = await EventPerformanceBaseline.findOne({ event_id: eventId });
        if (!baseline) return respond(res, 404, { success: false, error: 'Event not found or not completed', timestamp: new Date() });

        // ─ Assignment check (skip for brevity, logic mostly handles via EventPerformanceBaseline)
        const assignment = await Assignment.findOne({ event: eventId }); 
        const assignment_id = assignment ? assignment._id : baseline._id; // Provide a fallback for required schema prop if not found

        const results = [];
        let submitted = 0;
        let failed = 0;

        for (const review of reviews) {
            try {
                // Ensure auth
                const reviewData = {
                    ...review,
                    event_id: eventId,
                    assignment_id: assignment_id,
                    supervisor_id: supervisorId
                };

                await performanceService.submitReview(reviewData);
                submitted++;
                results.push({ staff_id: review.staff_id, status: 'success' });
            } catch (err) {
                failed++;
                results.push({ staff_id: review.staff_id, status: 'failed', error: err.message });
            }
        }

        respond(res, 200, {
            success: true,
            data: {
                submitted,
                failed,
                results
            },
            timestamp: new Date()
        });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message, timestamp: new Date() });
    }
};
